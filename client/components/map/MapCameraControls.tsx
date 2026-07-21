import React, { useState, useCallback, useEffect, useRef } from "react";
import { Plus, Minus, Compass, LocateFixed } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MapCameraControlsProps {
  mapRef: google.maps.Map | null;
  onFitBounds: () => void;
}

export function MapCameraControls({ mapRef, onFitBounds }: MapCameraControlsProps) {
  const coordRef = useRef<HTMLSpanElement>(null);

  const zoomIn = useCallback(() => {
    if (!mapRef) return;
    mapRef.setZoom((mapRef.getZoom() || 13) + 1);
  }, [mapRef]);

  const zoomOut = useCallback(() => {
    if (!mapRef) return;
    mapRef.setZoom((mapRef.getZoom() || 13) - 1);
  }, [mapRef]);

  useEffect(() => {
    let ticking = false;
    const handler = (e: CustomEvent<{lat: number; lng: number}>) => {
      if (!ticking && coordRef.current) {
        requestAnimationFrame(() => {
          if (coordRef.current) coordRef.current.textContent = `${e.detail.lat.toFixed(6)}, ${e.detail.lng.toFixed(6)}`;
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener("map-mousemove", handler as EventListener);
    return () => window.removeEventListener("map-mousemove", handler as EventListener);
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      {/* Zoom controls */}
      <div className="absolute left-4 bottom-28 md:left-auto md:right-4 md:bottom-24 z-[30] flex flex-col gap-1 max-md:bottom-4 max-md:left-2 max-md:gap-0.5">
        <div className="glass rounded-xl md:rounded-xl max-md:rounded-lg shadow-lg overflow-hidden">
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={zoomIn} className="map-toolbar-btn w-10 h-10 max-md:w-7 max-md:h-7 border-b border-border/30">
                <Plus className="h-4 w-4 max-md:h-3 max-md:w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">Zoom In</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={zoomOut} className="map-toolbar-btn w-10 h-10 max-md:w-7 max-md:h-7">
                <Minus className="h-4 w-4 max-md:h-3 max-md:w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">Zoom Out</TooltipContent>
          </Tooltip>
        </div>

        {/* Fit bounds */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onFitBounds} className="glass rounded-xl max-md:rounded-lg shadow-lg map-toolbar-btn w-10 h-10 max-md:w-7 max-md:h-7">
              <LocateFixed className="h-4 w-4 max-md:h-3 max-md:w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-xs">Tampilkan Semua Aset</TooltipContent>
        </Tooltip>

        {/* Compass rose (decorative) */}
        <div className="glass rounded-xl max-md:rounded-lg shadow-lg compass-rose select-none max-md:hidden" title="Utara">
          <div className="relative w-8 h-8">
            <span className="absolute top-0 left-1/2 -translate-x-1/2 text-red-500 font-bold" style={{fontSize: 9}}>N</span>
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-muted-foreground" style={{fontSize: 8}}>S</span>
            <span className="absolute left-0 top-1/2 -translate-y-1/2 text-muted-foreground" style={{fontSize: 8}}>W</span>
            <span className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground" style={{fontSize: 8}}>E</span>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-red-500 rotate-45" />
          </div>
        </div>
      </div>

      {/* Cursor coordinates status bar */}
      <div className="absolute bottom-0 left-0 right-0 z-10 map-status-bar hidden md:flex items-center gap-4">
        <span ref={coordRef}>-,-</span>
        <span className="text-muted-foreground/50">|</span>
        <span>Saung Jarkom</span>
      </div>
    </TooltipProvider>
  );
}
