import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useMapInfra, useMapCustomers, type Bbox, usePops, useOdcs, useOdps, useCustomers, usePoles, useCables, useOdpUtilization } from "@/hooks/useAssets";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Cable, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "sonner";
import { queryClient, queryKeys } from "@/lib/queryClient";
import { reverseGeocode } from "@/lib/geocode";
import { GoogleMap, Marker, Polyline, InfoWindow, OverlayView, MarkerClusterer } from "@react-google-maps/api";
import { useGoogleMaps } from "@/context/GoogleMapsContext";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

// Extracted components
import { MapToolbar } from "@/components/map/MapToolbar";
import { MapSearchBar } from "@/components/map/MapSearchBar";
import { MapLayerPanel } from "@/components/map/MapLayerPanel";
import { MapTypeSelector } from "@/components/map/MapTypeSelector";
import { MapCameraControls } from "@/components/map/MapCameraControls";
import { MapInfoWindowContent } from "@/components/map/MapInfoWindow";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { OdpDetailPanel } from "@/components/map/OdpDetailPanel";
import { MapMitraSelector } from "@/components/map/MapMitraSelector";
import { MapUtilityButtons } from "@/components/map/MapUtilityButtons";
import { FABSpeedDial } from "@/components/map/FABSpeedDial";
import { BottomSheet } from "@/components/shared/BottomSheet";

// Shared asset config
import {
  ASSET_COLORS, ASSET_MARKER_CONFIG, CABLE_COLORS, DARK_MAP_STYLE,
  dotIcon, odpUsageColor,
  type AssetType,
} from "@/lib/assetColors";
import { AssetQuickForm } from "./map/AssetQuickForm";
import { CableQuickForm } from "./map/CableQuickForm";
import { CableDetailPanel } from "./map/CableDetailPanel";
import { GARUT_CENTER, DEFAULT_ZOOM, SNAP_THRESHOLD_METERS, haversineMeters, nearestOnSegment, findSnapPoint, type SnapResult, type QuickFormProps } from "./map/shared";

export default function MapPage() {
  const { user, canDelete } = useAuth();
  const isMarketing = user?.role === "marketing";
  const isJabnetRoot = !!user?.isSystemAdmin;
  const ownMitraId = user?.activeMitraId ?? 1;
  const [viewMitraId, setViewMitraId] = useState<number>(ownMitraId);
  const viewingOther = viewMitraId !== ownMitraId;
  const readOnly = isMarketing || viewingOther;

  const { data: mitraListResp } = useQuery<any>({
    queryKey: ["/api/mitras", "map-selector"],
    queryFn: () => api.get<any>("/mitras"),
    enabled: isJabnetRoot,
    staleTime: 60_000,
  });
  const mitraOptions: Array<{ id: number; name: string }> = (mitraListResp ?? [])
    .map((m: any) => ({ id: m.id, name: m.displayName ?? m.name }));

  const mitraParam = viewingOther ? viewMitraId : undefined;
  const { data: infra, isLoading: infraLoading } = useMapInfra(mitraParam);
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const { data: viewportCustomers, isLoading: customersLoading } = useMapCustomers(bbox, true, mitraParam);

  // Compose data preserving the existing shape so downstream consumers work unchanged:
  const data = useMemo(() => infra ? {
    pops: infra.pops,
    odcs: infra.odcs,
    odps: infra.odps,
    poles: infra.poles,
    cables: infra.cables,
    customers: viewportCustomers?.customers || [],
  } : undefined, [infra, viewportCustomers]);

  const isLoading = infraLoading; // show skeleton only for infra; customers loads progressively
  const { data: odpUtilData } = useOdpUtilization();
  const { create: createPop, update: updatePop, remove: removePop } = usePops();
  const { data: popsList, create: createOdc, update: updateOdc } = useOdcs();
  const { data: odcsList, create: createOdp, update: updateOdp } = useOdps();
  const { data: odpsList, create: createCustomer, update: updateCustomer } = useCustomers();
  const { create: createPole, update: updatePole } = usePoles();
  const { create: createCable, remove: removeCable } = useCables();
  const popsData = usePops();
  const [, setLocation] = useLocation();
  // Hapus aset dari peta (POP/Kabel) - hanya untuk user dgn level delete. Konfirmasi via AlertDialog.
  const [deleteTarget, setDeleteTarget] = useState<{ type: "pop" | "cable"; id: number; name: string } | null>(null);
  const canDeleteSelected = (t: string) =>
    (t === "pop" && canDelete("pops")) || (t === "cable" && canDelete("cables"));
  const confirmDeleteAsset = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === "pop") await removePop.mutateAsync(deleteTarget.id);
      else await removeCable.mutateAsync(deleteTarget.id);
      toast.success(`${deleteTarget.type === "pop" ? "POP" : "Kabel"} "${deleteTarget.name}" dihapus`);
    } catch (e: any) {
      toast.error(e?.message || "Gagal menghapus");
    } finally {
      setDeleteTarget(null);
    }
  };

  const { isLoaded } = useGoogleMaps();

  // -- Core state --
  const [mapRef, setMapRef] = useState<google.maps.Map | null>(null);
  const [mapType, setMapType] = useState<"roadmap" | "satellite" | "hybrid" | "terrain">("roadmap");
  const [selectedInfo, setSelectedInfo] = useState<{ type: string; data: any; position: { lat: number; lng: number } } | null>(null);
  const MARKETING_LAYERS = { pop: false, odc: false, odp: true, customer: false, pole: false, cable: false };
  const [layers, setLayers] = useState<Record<string, boolean>>(() => {
    if (user?.role === "marketing") return MARKETING_LAYERS;
    try {
      const saved = localStorage.getItem("map_layers");
      return saved ? JSON.parse(saved) : { pop: true, odc: true, odp: true, customer: true, pole: true, cable: true };
    } catch { return { pop: true, odc: true, odp: true, customer: true, pole: true, cable: true }; }
  });
  const [showLabels, setShowLabels] = useState(() => {
    try { return localStorage.getItem("map_showLabels") !== "false"; } catch { return true; }
  });
  const [drawMode, setDrawMode] = useState<AssetType | "customer-drop" | null>(null);
  const [startOdpId, setStartOdpId] = useState<number | null>(null);
  const [quickForm, setQuickForm] = useState<{ type: Exclude<AssetType, "cable">; lat: number; lng: number } | null>(null);
  const [cablePoints, setCablePoints] = useState<[number, number][]>([]);
  const [showCableForm, setShowCableForm] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [selectedCable, setSelectedCable] = useState<{ id: number; name: string } | null>(null);
  // ODP mini-dashboard panel (lazy detail + ACS) - menggantikan InfoWindow ODP
  const [odpPanel, setOdpPanel] = useState<{ id: number; data: any } | null>(null);

  // -- Snap state --
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [snapPreview, setSnapPreview] = useState<SnapResult | null>(null);
  const [odpFullDetail, setOdpFullDetail] = useState(() => {
    // default true: klik ODP langsung muat pelanggan + ACS
    try { return localStorage.getItem("map_odpFullDetail") !== "false"; } catch { return true; }
  });
  const [showHierarchyLines, setShowHierarchyLines] = useState(() => {
    try { return localStorage.getItem("map_showHierarchy") === "true"; } catch { return false; }
  });
  const mouseMoveTimer = useRef<number | null>(null);

  // -- Viewport bbox debounce (tier-2 customer fetch) --
  const bboxDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMapIdle = useCallback(() => {
    if (!mapRef) return;
    if (bboxDebounceTimer.current) clearTimeout(bboxDebounceTimer.current);
    bboxDebounceTimer.current = setTimeout(() => {
      const bounds = mapRef.getBounds();
      if (!bounds) return;
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      setBbox({
        swLat: sw.lat(),
        swLng: sw.lng(),
        neLat: ne.lat(),
        neLng: ne.lng(),
      });
    }, 300);
  }, [mapRef]);

  // Cleanup bbox debounce timer on unmount to prevent setBbox firing on unmounted component
  useEffect(() => {
    return () => {
      if (bboxDebounceTimer.current) {
        clearTimeout(bboxDebounceTimer.current);
      }
    };
  }, []);

  // -- UI panel state --
  const [showSearch, setShowSearch] = useState(false);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [showMapType, setShowMapType] = useState(false);

  // -- Mobile bottom sheet state --
  const [mobileInfoSheet, setMobileInfoSheet] = useState(false);

  // -- Dark mode detection --
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  const toggleLayer = (key: string) => setLayers((prev) => {
    const next = { ...prev, [key]: !prev[key] };
    if (!isMarketing) localStorage.setItem("map_layers", JSON.stringify(next));
    return next;
  });

  const toggleLabels = (val: boolean) => {
    setShowLabels(val);
    if (!isMarketing) localStorage.setItem("map_showLabels", String(val));
  };
  const toggleHierarchy = (val: boolean) => {
    setShowHierarchyLines(val);
    if (!isMarketing) localStorage.setItem("map_showHierarchy", String(val));
  };
  const toggleOdpDetail = (val: boolean) => {
    setOdpFullDetail(val);
    if (!isMarketing) localStorage.setItem("map_odpFullDetail", String(val));
  };

  // -- Detect mobile --
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Update cursor when draw mode changes
  useEffect(() => {
    if (mapRef) {
      mapRef.setOptions({ draggableCursor: drawMode ? "crosshair" : "" });
    }
  }, [drawMode, mapRef]);

  // Read URL Params to fly-to asset location
  useEffect(() => {
    if (!mapRef || !data) return;
    const search = window.location.search;
    if (!search) return;
    const params = new URLSearchParams(search);
    const lat = params.get("lat");
    const lng = params.get("lng");
    const z = params.get("z");

    if (lat && lng) {
      const latNum = parseFloat(lat);
      const lngNum = parseFloat(lng);
      if (!isNaN(latNum) && !isNaN(lngNum)) {
        setTimeout(() => {
          mapRef.panTo({ lat: latNum, lng: lngNum });
          mapRef.setZoom(z ? parseInt(z, 10) : 20);
          window.history.replaceState({}, document.title, window.location.pathname);
        }, 500);
      }
    }
  }, [mapRef, data]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showSearch) setShowSearch(false);
        else if (drawMode) cancelDraw();
        else if (odpPanel) setOdpPanel(null);
        else if (selectedInfo) setSelectedInfo(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showSearch, drawMode, selectedInfo, odpPanel]);

  const parsePath = (pathStr: string | null): { lat: number; lng: number }[] => {
    if (!pathStr) return [];
    try {
      const parsed = JSON.parse(pathStr);
      return parsed.map((p: any) => Array.isArray(p) ? { lat: p[0], lng: p[1] } : p);
    } catch { return []; }
  };

  // -- Map click handler --
  const handleMapClick = useCallback(async (e: google.maps.MapMouseEvent) => {
    if (readOnly) return; // marketing OR viewing another mitra: view-only, no drawing
    if (!drawMode || !e.latLng) return;
    const rawLat = e.latLng.lat();
    const rawLng = e.latLng.lng();

    if (drawMode === "cable") {
      setCablePoints((prev) => [...prev, [rawLat, rawLng] as [number, number]]);
      return;
    }

    if (drawMode === "customer-drop") {
      setQuickForm({ type: "customer", lat: rawLat, lng: rawLng } as any);
      const geo = await reverseGeocode(rawLat, rawLng);
      if (geo) {
        setQuickForm(prev => prev ? { ...prev, district: geo.district, village: geo.village, address: geo.formatted } as any : prev);
      }
      return;
    }

    if (snapEnabled && data?.cables) {
      const clicked = { lat: rawLat, lng: rawLng };
      const snap = findSnapPoint(clicked, data.cables, parsePath, SNAP_THRESHOLD_METERS);
      if (snap) {
        setSnapPreview(null);
        setQuickForm({ type: drawMode as Exclude<AssetType, "cable">, lat: snap.point.lat, lng: snap.point.lng } as any);
        const geo = await reverseGeocode(snap.point.lat, snap.point.lng);
        if (geo) {
          setQuickForm(prev => prev ? { ...prev, district: geo.district, village: geo.village, address: geo.formatted } as any : prev);
        }
        return;
      }
    }

    setQuickForm({ type: drawMode as Exclude<AssetType, "cable">, lat: rawLat, lng: rawLng } as any);
    const geo = await reverseGeocode(rawLat, rawLng);
    if (geo) {
      setQuickForm(prev => prev ? { ...prev, district: geo.district, village: geo.village, address: geo.formatted } as any : prev);
    }
  }, [drawMode, snapEnabled, data, readOnly]);

  const handleAssetSubmit = async (formData: any, isEdit?: boolean, initialDataId?: number) => {
    if (readOnly) return; // safety: no asset writes while viewing another mitra
    setIsPending(true);
    try {
      const type = quickForm!.type;

      if (type === "customer" && drawMode === "customer-drop" && startOdpId) {
        const odp = data?.odps.find(o => o.id === startOdpId);
        if (odp && odp.lat && odp.lng) {
          formData.odpId = startOdpId;
          const cust = await createCustomer.mutateAsync(formData);

          await createCable.mutateAsync({
             name: `Drop ${formData.name}`,
             code: `CBL-DRP-${Date.now().toString().slice(-4)}`,
             cableType: "drop",
             totalCore: 2,
             usedCore: 1,
             startPoint: JSON.stringify({ type: "odp", id: odp.id }),
             endPoint: JSON.stringify({ type: "customer", id: cust.id }),
             pathCoordinates: JSON.stringify([ [odp.lat, odp.lng], [formData.lat, formData.lng] ]),
             status: "active"
          });
          toast.success("Pelanggan & Kabel Drop berhasil ditarik");
          setQuickForm(null);
          setDrawMode(null);
          setStartOdpId(null);
          setIsPending(false);
          return;
        }
      }

      if (isEdit && initialDataId) {
        const updaters: Record<string, any> = { pop: updatePop, odc: updateOdc, odp: updateOdp, customer: updateCustomer, pole: updatePole };
        await updaters[type].mutateAsync({ id: initialDataId, data: formData });
        toast.success(`${ASSET_MARKER_CONFIG[type as keyof typeof ASSET_MARKER_CONFIG].label} berhasil diperbarui`);
      } else {
        const creators: Record<string, any> = { pop: createPop, odc: createOdc, odp: createOdp, customer: createCustomer, pole: createPole };
        await creators[type].mutateAsync(formData);
        toast.success(`${ASSET_MARKER_CONFIG[type as keyof typeof ASSET_MARKER_CONFIG].label} berhasil ditambahkan di peta`);
      }
      setQuickForm(null);
    } catch (e: any) {
      toast.error(e.message || "Gagal menyimpan");
    } finally {
      setIsPending(false);
    }
  };
  const handleCustomerDragEnd = async (e: google.maps.MapMouseEvent, cust: any) => {
    if (!e.latLng) return;
    const newLat = e.latLng.lat();
    const newLng = e.latLng.lng();
    if (window.confirm(`Simpan lokasi baru untuk ${cust.name}?`)) {
      setIsPending(true);
      try {
        await updateCustomer.mutateAsync({ id: cust.id, data: { ...cust, lat: newLat, lng: newLng, isStatic: 1 } });
        toast.success("Lokasi pelanggan berhasil dipindahkan dan dikunci (Statis).");
      } catch (err: any) {
        toast.error(err.message || "Gagal memindahkan lokasi");
        queryClient.invalidateQueries({ queryKey: queryKeys.mapData }); queryClient.invalidateQueries({ queryKey: queryKeys.customers });
      } finally {
        setIsPending(false);
      }
    } else {
      queryClient.invalidateQueries({ queryKey: queryKeys.mapData }); queryClient.invalidateQueries({ queryKey: queryKeys.customers });
    }
  };

  const handleCableSubmit = async (formData: any) => {
    setIsPending(true);
    try {
      await createCable.mutateAsync(formData);
      toast.success("Kabel berhasil ditambahkan di peta");
      setCablePoints([]);
      setShowCableForm(false);
      setDrawMode(null);
    } catch (e: any) {
      toast.error(e.message || "Gagal menyimpan kabel");
    } finally {
      setIsPending(false);
    }
  };

  const cancelDraw = () => {
    setDrawMode(null);
    setStartOdpId(null);
    setQuickForm(null);
    setCablePoints([]);
    setShowCableForm(false);
    setSnapPreview(null);
  };

  const finishDrawing = () => {
    if (cablePoints.length < 2) { toast.error("Minimal 2 titik untuk membuat kabel"); return; }
    setShowCableForm(true);
  };

  const handleMouseMove = useCallback((e: google.maps.MapMouseEvent) => {
    // Track cursor coordinates via custom event to prevent MapPage re-renders
    if (e.latLng) {
      window.dispatchEvent(new CustomEvent("map-mousemove", { detail: { lat: e.latLng.lat(), lng: e.latLng.lng() } }));
    }

    if (!snapEnabled || !drawMode || drawMode === "cable" || !e.latLng || !data) {
      if (snapPreview) setSnapPreview(null);
      return;
    }
    if (mouseMoveTimer.current !== null) return;
    mouseMoveTimer.current = window.setTimeout(() => {
      mouseMoveTimer.current = null;
      if (!e.latLng) return;
      const point = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      const snap = findSnapPoint(point, data.cables, parsePath, SNAP_THRESHOLD_METERS);
      setSnapPreview(snap);
    }, 30);
  }, [snapEnabled, drawMode, data, snapPreview]);

  // -- Fit bounds --
  const fitAllBounds = useCallback(() => {
    if (!mapRef || !data) return;
    const bounds = new google.maps.LatLngBounds();
    let count = 0;
    data.pops.forEach(p => { if (p.lat && p.lng) { bounds.extend({ lat: p.lat, lng: p.lng }); count++; } });
    data.odcs.forEach(o => { if (o.lat && o.lng) { bounds.extend({ lat: o.lat, lng: o.lng }); count++; } });
    data.odps.forEach(o => { if (o.lat && o.lng) { bounds.extend({ lat: o.lat, lng: o.lng }); count++; } });
    data.customers.forEach(c => { if (c.lat && c.lng) { bounds.extend({ lat: c.lat, lng: c.lng }); count++; } });
    data.poles.forEach(p => { if (p.lat && p.lng) { bounds.extend({ lat: p.lat, lng: p.lng }); count++; } });
    if (count > 0) mapRef.fitBounds(bounds, 50);
  }, [mapRef, data]);

  // -- Search fly-to --
  const handleSearchResultClick = useCallback((result: { lat?: number | null; lng?: number | null; type: string; id: number }) => {
    if (!mapRef || !result.lat || !result.lng) return;
    mapRef.panTo({ lat: result.lat, lng: result.lng });
    mapRef.setZoom(18);
    setShowSearch(false);
  }, [mapRef]);

  // Memoized lookups for performance (must be before early returns to satisfy Rules of Hooks)
  const customersByOdp = React.useMemo(() => {
    const map = new Map<number, any[]>();
    data?.customers.forEach(c => {
      if (c.odpId) {
        if (!map.has(c.odpId)) map.set(c.odpId, []);
        map.get(c.odpId)!.push(c);
      }
    });
    return map;
  }, [data?.customers]);

  const utilByOdp = React.useMemo(() => {
    const map = new Map<number, any>();
    odpUtilData?.odps.forEach(u => map.set(u.id, u));
    return map;
  }, [odpUtilData?.odps]);

  const odpById = React.useMemo(() => {
    const map = new Map<number, any>();
    data?.odps.forEach(o => map.set(o.id, o));
    return map;
  }, [data?.odps]);

  const odcById = React.useMemo(() => {
    const map = new Map<number, any>();
    data?.odcs.forEach(o => map.set(o.id, o));
    return map;
  }, [data?.odcs]);

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-6rem)] md:h-[calc(100vh-6rem)] flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          Memuat peta...
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Marker scale based on device
  const getScale = (type: Exclude<AssetType, "cable">) =>
    isMobile ? ASSET_MARKER_CONFIG[type].mobileScale : ASSET_MARKER_CONFIG[type].scale;

  return (
    <div className={`${isMobile ? "" : "space-y-2"}`}>
      {/* Header - hidden on mobile */}
      {!isMobile && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Peta Jaringan</h1>
            <p className="text-muted-foreground text-sm">
              {isMarketing
                ? "Tampilan ODP - klik marker untuk info detail"
                : drawMode
                  ? drawMode === "cable"
                    ? "Klik pada peta untuk menambah titik jalur kabel"
                    : `Klik pada peta untuk menempatkan ${ASSET_MARKER_CONFIG[drawMode as keyof typeof ASSET_MARKER_CONFIG]?.label}`
                  : "Pilih mode di toolbar untuk mulai menambah aset"}
            </p>
          </div>
        </div>
      )}

      {/* Map container */}
      <div className={
          isMobile
            ? "fixed inset-0 z-10 overflow-hidden"
            : "relative overflow-hidden border rounded-lg h-[calc(100vh-10rem)]"
        }>
        {!isLoaded ? (
          <div className="h-full flex items-center justify-center">
            <div className="flex items-center gap-3 text-muted-foreground">
              <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              Memuat Google Maps...
            </div>
          </div>
        ) : (
          <GoogleMap
            mapContainerClassName="h-full w-full"
            center={GARUT_CENTER}
            zoom={DEFAULT_ZOOM}
            mapTypeId={mapType}
            onClick={handleMapClick}
            onMouseMove={handleMouseMove}
            onLoad={(map) => setMapRef(map)}
            onIdle={handleMapIdle}
            options={{
              fullscreenControl: false,
              streetViewControl: false,
              mapTypeControl: false,
              zoomControl: false,
              styles: isDark ? DARK_MAP_STYLE : undefined,
            }}
          >
            <MarkerClusterer options={{ maxZoom: 15, gridSize: 60, zoomOnClick: true }}>
              {(clusterer) => (
                <>
                  {/* -- POP markers -- */}
                  {layers.pop && data.pops.filter((p) => p.lat && p.lng).map((pop) => (
                    <Marker
                      key={`pop-${pop.id}`}
                      position={{ lat: pop.lat!, lng: pop.lng! }}
                      icon={dotIcon(ASSET_COLORS.pop.primary, ASSET_COLORS.pop.stroke, getScale("pop"))}
                      title={pop.name}
                      zIndex={5}
                      onClick={() => { setSelectedInfo({ type: "pop", data: pop, position: { lat: pop.lat!, lng: pop.lng! } }); if (isMobile) setMobileInfoSheet(true); }}
                      clusterer={clusterer}
                    />
                  ))}

                  {/* -- ODC markers + labels -- */}
                  {layers.odc && data.odcs.filter((o) => o.lat && o.lng).map((odc) => (
                    <React.Fragment key={`odc-${odc.id}`}>
                      <Marker
                        position={{ lat: odc.lat!, lng: odc.lng! }}
                        icon={dotIcon(ASSET_COLORS.odc.primary, ASSET_COLORS.odc.stroke, getScale("odc"))}
                        title={odc.name}
                        zIndex={4}
                        onClick={() => { setSelectedInfo({ type: "odc", data: odc, position: { lat: odc.lat!, lng: odc.lng! } }); if (isMobile) setMobileInfoSheet(true); }}
                        clusterer={clusterer}
                      />
                      {showLabels && (
                        <OverlayView position={{ lat: odc.lat!, lng: odc.lng! }} mapPaneName={OverlayView.OVERLAY_LAYER}>
                          <div style={{ position: "absolute", transform: "translate(-50%, 7px)", background: "rgba(37,99,235,0.92)", color: "white", padding: "1px 5px", borderRadius: 4, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", pointerEvents: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>
                            {odc.name}
                          </div>
                        </OverlayView>
                      )}
                    </React.Fragment>
                  ))}

                  {layers.odp && data.odps.filter((o) => o.lat && o.lng).map((odp) => {
                    const util = utilByOdp.get(odp.id);
                    const pct = util?.usedPct ?? (odp.capacity ? Math.round(((odp.usedCapacity ?? 0) / odp.capacity) * 100) : 0);
                    const { color: markerColor, stroke: markerStroke } = odpUsageColor(pct);
                    const connectedCustomers = customersByOdp.get(odp.id) || [];
                    const odpWithUtil = { ...odp, _usedPorts: util?.usedPorts ?? odp.usedCapacity ?? 0, _usedPct: pct, connectedCustomers };
                    return (
                      <React.Fragment key={`odp-${odp.id}`}>
                        <Marker
                          position={{ lat: odp.lat!, lng: odp.lng! }}
                          icon={dotIcon(markerColor, markerStroke, getScale("odp"))}
                          title={odp.name}
                          zIndex={5}
                          onClick={() => { setSelectedInfo(null); setMobileInfoSheet(false); setOdpPanel({ id: odp.id, data: odpWithUtil }); }}
                          clusterer={clusterer}
                        />
                        {showLabels && (
                          <OverlayView position={{ lat: odp.lat!, lng: odp.lng! }} mapPaneName={OverlayView.OVERLAY_LAYER}>
                            <div style={{ position: "absolute", transform: "translate(-50%, 7px)", background: `${markerColor}ee`, color: "white", padding: "1px 5px", borderRadius: 4, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", pointerEvents: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>
                              {odp.name}
                            </div>
                          </OverlayView>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* -- Pole markers -- */}
                  {layers.pole && data.poles.filter((p) => p.lat && p.lng).map((pole) => (
                    <Marker
                      key={`pole-${pole.id}`}
                      position={{ lat: pole.lat!, lng: pole.lng! }}
                      icon={dotIcon(ASSET_COLORS.pole.primary, ASSET_COLORS.pole.stroke, getScale("pole"))}
                      title={pole.name}
                      zIndex={2}
                      onClick={() => { setSelectedInfo({ type: "pole", data: pole, position: { lat: pole.lat!, lng: pole.lng! } }); if (isMobile) setMobileInfoSheet(true); }}
                      clusterer={clusterer}
                    />
                  ))}

                  {/* -- Customer markers (now inside clusterer for joint clustering) -- */}
                  {layers.customer && data.customers.filter((c) => c.lat && c.lng).map((cust) => {
                    const isStatic = cust.isStatic === 1;
                    const colorConfig = isStatic ? ASSET_COLORS.customerStatic : ASSET_COLORS.customer;
                    const scaleConfig = isStatic ? getScale("customerStatic" as any) : getScale("customer");
                    const isSelected = selectedInfo?.type === "customer" && selectedInfo.data.id === cust.id;
                    return (
                      <Marker
                        key={`cust-${cust.id}`}
                        position={{ lat: cust.lat!, lng: cust.lng! }}
                        icon={dotIcon(colorConfig.primary, colorConfig.stroke, scaleConfig)}
                        title={cust.name + (isStatic ? " (Verified)" : "")}
                        zIndex={isStatic ? 4 : 3}
                        onClick={() => { setSelectedInfo({ type: "customer", data: cust, position: { lat: cust.lat!, lng: cust.lng! } }); if (isMobile) setMobileInfoSheet(true); }}
                        draggable={isSelected}
                        onDragEnd={(e) => handleCustomerDragEnd(e, cust)}
                        clusterer={clusterer}
                      />
                    );
                  })}
                </>
              )}
            </MarkerClusterer>

            {/* -- Cable polylines -- */}
            {layers.cable && data.cables.map((cable) => {
              const path = parsePath(cable.pathCoordinates);
              if (path.length < 2) return null;
              return (
                <Polyline key={`cable-${cable.id}`} path={path} options={{ strokeColor: CABLE_COLORS[cable.cableType || "feeder"] || "#F97316", strokeWeight: 3, strokeOpacity: 0.8, clickable: true }} onClick={() => { const midIdx = Math.floor(path.length / 2); setSelectedInfo({ type: "cable", data: cable, position: path[midIdx] }); if (isMobile) setMobileInfoSheet(true); }} />
              );
            })}

            {/* -- Hierarchy lines -- */}
            {showHierarchyLines && layers.odc && data.odcs.filter(o => o.lat && o.lng && o.popId).map(odc => {
              const pop = data.pops.find(p => p.id === odc.popId);
              if (!pop?.lat || !pop?.lng) return null;
              return <Polyline key={`link-odc-${odc.id}`} path={[{ lat: odc.lat!, lng: odc.lng! }, { lat: pop.lat!, lng: pop.lng! }]} options={{ strokeColor: "#3B82F6", strokeWeight: 1, strokeOpacity: 0.4, icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 2 }, offset: "0", repeat: "10px" }] }} />;
            })}
            {showHierarchyLines && layers.odp && data.odps.filter(o => o.lat && o.lng && o.odcId).map(odp => {
              const odc = odcById.get(odp.odcId!);
              if (!odc?.lat || !odc?.lng) return null;
              return <Polyline key={`link-odp-${odp.id}`} path={[{ lat: odp.lat!, lng: odp.lng! }, { lat: odc.lat!, lng: odc.lng! }]} options={{ strokeColor: "#22C55E", strokeWeight: 1, strokeOpacity: 0.4, icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 2 }, offset: "0", repeat: "10px" }] }} />;
            })}
            {showHierarchyLines && layers.customer && data.customers.filter(c => c.lat && c.lng && c.odpId).map(cust => {
              const odp = odpById.get(cust.odpId!);
              if (!odp?.lat || !odp?.lng) return null;
              return <Polyline key={`link-cust-${cust.id}`} path={[{ lat: cust.lat!, lng: cust.lng! }, { lat: odp.lat!, lng: odp.lng! }]} options={{ strokeColor: "#A855F7", strokeWeight: 1, strokeOpacity: 0.3, icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 2 }, offset: "0", repeat: "10px" }] }} />;
            })}

            {/* -- Cable drawing preview -- */}
            {drawMode === "cable" && cablePoints.length >= 2 && (
              <Polyline path={cablePoints.map(([lat, lng]) => ({ lat, lng }))} options={{ strokeColor: "#F97316", strokeWeight: 3, strokeOpacity: 0.9, icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 }, offset: "0", repeat: "20px" }] }} />
            )}
            {drawMode === "cable" && cablePoints.map(([lat, lng], i) => (
              <Marker key={`draw-${i}`} position={{ lat, lng }} icon={dotIcon("#F97316", "#EA580C", 6)} clickable={false} zIndex={10} />
            ))}

            {/* -- Snap preview -- */}
            {snapEnabled && snapPreview && drawMode && drawMode !== "cable" && (
              <>
                <Marker position={snapPreview.point} icon={{ path: 0 as any, scale: 14, fillColor: CABLE_COLORS[snapPreview.cableType] || "#F97316", fillOpacity: 0.2, strokeColor: CABLE_COLORS[snapPreview.cableType] || "#F97316", strokeWeight: 1.5, strokeOpacity: 0.6 }} zIndex={19} clickable={false} />
                <Marker position={snapPreview.point} icon={{ path: 0 as any, scale: 6, fillColor: "#FFFFFF", fillOpacity: 1, strokeColor: CABLE_COLORS[snapPreview.cableType] || "#F97316", strokeWeight: 2.5 }} zIndex={20} clickable={false} />
                <OverlayView position={snapPreview.point} mapPaneName={OverlayView.FLOAT_PANE}>
                  <div style={{ position: "absolute", transform: "translate(-50%, -28px)", background: CABLE_COLORS[snapPreview.cableType] || "#F97316", color: "white", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", pointerEvents: "none", boxShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>
                     Snap: {snapPreview.cableName} (~{Math.round(snapPreview.distMeters)}m)
                  </div>
                </OverlayView>
              </>
            )}

            {/* -- InfoWindow (Desktop) -- */}
            {selectedInfo && !isMobile && (
              <InfoWindow position={selectedInfo.position} onCloseClick={() => setSelectedInfo(null)}>
                <MapInfoWindowContent
                  type={selectedInfo.type}
                  data={selectedInfo.data}
                  onClose={() => setSelectedInfo(null)}
                  onAddCustomerDrop={!readOnly && selectedInfo.type === "odp" ? () => {
                     const odpId = selectedInfo.data.id;
                     setSelectedInfo(null);
                     setStartOdpId(odpId);
                     setDrawMode("customer-drop");
                     toast.info("Klik lokasi rumah pelanggan di peta untuk menarik kabel drop dari ODP ini.");
                  } : undefined}
                  onViewCableDetail={!isMarketing && selectedInfo.type === "cable" ? () => { setSelectedCable({ id: selectedInfo.data.id, name: selectedInfo.data.name }); setSelectedInfo(null); } : undefined}
                  onAddAssetAtCable={!readOnly && selectedInfo.type === "cable" ? (t) => {
                    const pos = selectedInfo.position;
                    setSelectedInfo(null);
                    setSnapEnabled(true);
                    setDrawMode(t);
                    setQuickForm({ type: t, lat: pos.lat, lng: pos.lng });
                  } : undefined}
                  onEdit={!readOnly && selectedInfo.type !== "cable" ? () => {
                     const asset = selectedInfo.data;
                     const pos = selectedInfo.position;
                     setSelectedInfo(null);
                     if (isMobile) setMobileInfoSheet(false);
                     setQuickForm({
                       type: selectedInfo.type as Exclude<AssetType, "cable">,
                       lat: pos.lat,
                       lng: pos.lng,
                       district: asset.district,
                       village: asset.village,
                       address: asset.address,
                       isEdit: true,
                       initialData: asset,
                     } as any);
                  } : undefined}
                  onDelete={!readOnly && canDeleteSelected(selectedInfo.type) ? () => {
                    setDeleteTarget({ type: selectedInfo.type as "pop" | "cable", id: selectedInfo.data.id, name: selectedInfo.data.name });
                    setSelectedInfo(null);
                  } : undefined}
                />
              </InfoWindow>
            )}
          </GoogleMap>
        )}

        {/* -- Tier-2 customer fetch loading indicator -- */}
        {customersLoading && bbox && (
          <div className="absolute bottom-4 right-4 z-50 bg-card/95 backdrop-blur rounded-md px-3 py-1.5 text-xs flex items-center gap-2 shadow-md">
            <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span>Loading customers...</span>
          </div>
        )}

        {/* ================ JABNET MITRA SELECTOR (owner only) ================ */}
        {isJabnetRoot && (
          <MapMitraSelector
            mitraOptions={mitraOptions}
            viewMitraId={viewMitraId}
            ownMitraId={ownMitraId}
            viewingOther={viewingOther}
            panelOpen={showSearch || showLayerPanel || showMapType}
            onChange={setViewMitraId}
          />
        )}

        {/* ================ DESKTOP TOOLBAR ================ */}
        {!readOnly && (
          <MapToolbar
            drawMode={drawMode as AssetType | null}
            snapEnabled={snapEnabled}
            onDrawModeChange={setDrawMode}
            onSnapToggle={() => setSnapEnabled(v => !v)}
            onSearchClick={() => { setShowSearch(true); setShowLayerPanel(false); setShowMapType(false); }}
            onLayerClick={() => { setShowLayerPanel(v => !v); setShowSearch(false); setShowMapType(false); }}
            onMapTypeClick={() => { setShowMapType(v => !v); setShowLayerPanel(false); setShowSearch(false); }}
            cablePointsCount={cablePoints.length}
            onFinishCable={finishDrawing}
            onUndoCable={() => setCablePoints((p) => p.slice(0, -1))}
            onCancelDraw={cancelDraw}
            stacked={isJabnetRoot}
          />
        )}

        {/* ================ SEARCH BAR ================ */}
        <MapSearchBar
          visible={showSearch}
          onClose={() => setShowSearch(false)}
          onResultClick={handleSearchResultClick}
          onOpenOdp={(odpId) => {
            const odp = data?.odps.find((o) => o.id === odpId);
            if (odp?.lat && odp?.lng && mapRef) { mapRef.panTo({ lat: odp.lat, lng: odp.lng }); mapRef.setZoom(18); }
            setShowSearch(false);
            setOdpPanel({ id: odpId, data: odp ?? {} });
          }}
          data={data}
        />

        {/* ================ LAYER PANEL ================ */}
        <MapLayerPanel
          visible={showLayerPanel}
          onClose={() => setShowLayerPanel(false)}
          layers={layers}
          showLabels={showLabels}
          showHierarchyLines={showHierarchyLines}
          odpFullDetail={odpFullDetail}
          onToggleLayer={toggleLayer}
          onToggleLabels={() => toggleLabels(!showLabels)}
          onToggleHierarchy={() => toggleHierarchy(!showHierarchyLines)}
          onToggleOdpDetail={() => toggleOdpDetail(!odpFullDetail)}
        />

        {/* ================ MAP TYPE SELECTOR ================ */}
        <MapTypeSelector
          visible={showMapType}
          onClose={() => setShowMapType(false)}
          mapType={mapType}
          onSelect={(t) => setMapType(t as any)}
        />

        {/* ================ CAMERA CONTROLS ================ */}
        <MapCameraControls
          mapRef={mapRef}
          onFitBounds={fitAllBounds}
        />

        {/* ================ MOBILE FAB (hidden for marketing) ================ */}
        {!readOnly && (
          <FABSpeedDial
            drawMode={drawMode as AssetType | null}
            onSelectMode={(mode) => { cancelDraw(); setDrawMode(mode); }}
            onCancel={cancelDraw}
          />
        )}

        {/* ================ MOBILE UTILITY BUTTONS (Search, Layer, Map Type) ================ */}
        {isMobile && (isMarketing || !drawMode) && (
          <MapUtilityButtons
            onSearchClick={() => { setShowSearch(v => !v); setShowLayerPanel(false); setShowMapType(false); }}
            onLayerClick={() => { setShowLayerPanel(v => !v); setShowSearch(false); setShowMapType(false); }}
            onMapTypeClick={() => { setShowMapType(v => !v); setShowLayerPanel(false); setShowSearch(false); }}
          />
        )}

        {/* ================ QUICK FORM OVERLAY ================ */}
        {quickForm && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 max-w-[90vw]">
            <AssetQuickForm
              type={quickForm.type}
              lat={quickForm.lat}
              lng={quickForm.lng}
              district={(quickForm as any).district}
              village={(quickForm as any).village}
              address={(quickForm as any).address}
              isEdit={(quickForm as any).isEdit}
              initialData={(quickForm as any).initialData}
              onSubmit={handleAssetSubmit}
              onCancel={() => setQuickForm(null)}
              isPending={isPending}
              pops={popsData.data}
              odcs={data.odcs}
              odps={data.odps}
              hideOdpDropdown={drawMode === "customer-drop"}
            />
          </div>
        )}

        {/* ================ CABLE FORM OVERLAY ================ */}
        {showCableForm && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 max-w-[90vw]">
            <CableQuickForm
              points={cablePoints}
              onSubmit={handleCableSubmit}
              onCancel={() => { setShowCableForm(false); setCablePoints([]); setDrawMode(null); }}
              isPending={isPending}
            />
          </div>
        )}

        {/* ================ STATUS BAR (draw mode) ================ */}
        {drawMode && !isMobile && (
          <div className="absolute bottom-8 right-4 z-10">
            <Badge
              className="px-3 py-1.5 text-xs shadow-lg animate-pop-in"
              style={{
                backgroundColor: drawMode === "cable" ? "#F97316" : ASSET_MARKER_CONFIG[drawMode as keyof typeof ASSET_MARKER_CONFIG]?.color || "#666",
                color: "white",
              }}
            >
              Mode: {drawMode === "cable" ? "Tarik Kabel" : `Tambah ${ASSET_MARKER_CONFIG[drawMode as keyof typeof ASSET_MARKER_CONFIG]?.label}`}
              <button onClick={cancelDraw} className="ml-2 hover:opacity-70">
                <X className="h-3 w-3 inline" />
              </button>
            </Badge>
          </div>
        )}
      </div>

      {/* ================ MOBILE INFO BOTTOM SHEET ================ */}
      {isMobile && selectedInfo && (
        <BottomSheet
          open={mobileInfoSheet}
          onClose={() => { setMobileInfoSheet(false); setSelectedInfo(null); }}
          height="md"
        >
          <MapInfoWindowContent
            type={selectedInfo.type}
            data={selectedInfo.data}
            onClose={() => { setMobileInfoSheet(false); setSelectedInfo(null); }}
            onAddCustomerDrop={!readOnly && selectedInfo.type === "odp" ? () => {
              const odpId = selectedInfo.data.id;
              setMobileInfoSheet(false);
              setSelectedInfo(null);
              setStartOdpId(odpId);
              setDrawMode("customer-drop");
              toast.info("Klik lokasi rumah pelanggan di peta untuk menarik kabel drop dari ODP ini.");
            } : undefined}
            onViewCableDetail={selectedInfo.type === "cable" ? () => { setSelectedCable({ id: selectedInfo.data.id, name: selectedInfo.data.name }); setSelectedInfo(null); setMobileInfoSheet(false); } : undefined}
            onAddAssetAtCable={!readOnly && selectedInfo.type === "cable" ? (t) => {
              const pos = selectedInfo.position;
              setSelectedInfo(null);
              setMobileInfoSheet(false);
              setSnapEnabled(true);
              setDrawMode(t);
              setQuickForm({ type: t, lat: pos.lat, lng: pos.lng });
            } : undefined}
            onEdit={!readOnly && selectedInfo.type !== "cable" ? () => {
              const asset = selectedInfo.data;
              const pos = selectedInfo.position;
              setSelectedInfo(null);
              setMobileInfoSheet(false);
              setQuickForm({
                type: selectedInfo.type as Exclude<AssetType, "cable">,
                lat: pos.lat,
                lng: pos.lng,
                district: asset.district,
                village: asset.village,
                address: asset.address,
                isEdit: true,
                initialData: asset,
              } as any);
            } : undefined}
            onDelete={!readOnly && canDeleteSelected(selectedInfo.type) ? () => {
              setDeleteTarget({ type: selectedInfo.type as "pop" | "cable", id: selectedInfo.data.id, name: selectedInfo.data.name });
              setSelectedInfo(null);
              setMobileInfoSheet(false);
            } : undefined}
          />
        </BottomSheet>
      )}

      {/* Cable Core Detail Dialog */}
      {selectedCable && (
        <CableDetailPanel cableId={selectedCable.id} cableName={selectedCable.name} onClose={() => setSelectedCable(null)} />
      )}

      {/* Konfirmasi hapus POP/Kabel dari peta */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {deleteTarget?.type === "pop" ? "POP" : "Kabel"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "cable"
                ? `Kabel "${deleteTarget?.name}" beserta core dan koneksinya akan dihapus. Data yang dihapus tidak dapat dikembalikan.`
                : `POP "${deleteTarget?.name}" akan dihapus. Data yang dihapus tidak dapat dikembalikan.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteAsset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ODP mini-dashboard - lazy detail + ACS (menggantikan InfoWindow ODP) */}
      {odpPanel && (
        <OdpDetailPanel
          odpId={odpPanel.id}
          isMobile={isMobile}
          defaultFullDetail={odpFullDetail}
          onClose={() => setOdpPanel(null)}
          onOpenCustomer={(customerId) => setLocation(`/customers?q=${encodeURIComponent(customerId)}`)}
          onEdit={!readOnly ? () => {
            const asset = odpPanel.data;
            setOdpPanel(null);
            setQuickForm({
              type: "odp", lat: asset.lat, lng: asset.lng,
              district: asset.district, village: asset.village, address: asset.address,
              isEdit: true, initialData: asset,
            } as any);
          } : undefined}
          onAddCustomerDrop={!readOnly ? () => {
            const odpId = odpPanel.id;
            setOdpPanel(null);
            setStartOdpId(odpId);
            setDrawMode("customer-drop");
            toast.info("Klik lokasi rumah pelanggan di peta untuk menarik kabel drop dari ODP ini.");
          } : undefined}
        />
      )}
    </div>
  );
}
