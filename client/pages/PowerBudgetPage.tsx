import { usePowerBudget } from "@/hooks/useAssets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { Plus, Trash2, Calculator } from "lucide-react";

const SPLITTER_RATIOS = ["1:2", "1:4", "1:8", "1:16", "1:32"] as const;

const CONSTANTS = {
  gponOutput: 8, // dBm
  fiberLoss: 0.35, // dB/km
  spliceLoss: 0.1, // dB/splice
  connectorLoss: 0.5, // dB/connector
  splitterLoss: {
    "1:2": 3.5,
    "1:4": 7.0,
    "1:8": 10.5,
    "1:16": 13.5,
    "1:32": 17.0,
  } as Record<string, number>,
  rxSensitivity: -28, // dBm
  targetMax: -22, // dBm
};

interface BudgetResult {
  totalLoss: number;
  rxPower: number;
  status: string;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "OK":
      return <Badge className="bg-green-500 text-white hover:bg-green-600">OK</Badge>;
    case "Warning":
      return <Badge className="bg-yellow-500 text-white hover:bg-yellow-600">Warning</Badge>;
    case "Fail":
      return <Badge className="bg-red-500 text-white hover:bg-red-600">Fail</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function PowerBar({ rxPower }: { rxPower: number }) {
  // Range: +8 dBm to -32 dBm (total 40 dB range for visual)
  const minDb = -32;
  const maxDb = 8;
  const range = maxDb - minDb;

  const rxPercent = Math.max(0, Math.min(100, ((rxPower - minDb) / range) * 100));
  const targetPercent = ((CONSTANTS.targetMax - minDb) / range) * 100;
  const sensitivityPercent = ((CONSTANTS.rxSensitivity - minDb) / range) * 100;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{minDb} dBm</span>
        <span>0 dBm</span>
        <span>+{maxDb} dBm</span>
      </div>
      <div className="relative h-8 rounded-full bg-muted overflow-hidden">
        {/* Fail zone */}
        <div
          className="absolute inset-y-0 left-0 bg-red-200"
          style={{ width: `${sensitivityPercent}%` }}
        />
        {/* Warning zone */}
        <div
          className="absolute inset-y-0 bg-yellow-200"
          style={{ left: `${sensitivityPercent}%`, width: `${targetPercent - sensitivityPercent}%` }}
        />
        {/* OK zone */}
        <div
          className="absolute inset-y-0 bg-green-200"
          style={{ left: `${targetPercent}%`, right: "0" }}
        />
        {/* Sensitivity marker */}
        <div
          className="absolute inset-y-0 w-0.5 bg-red-600"
          style={{ left: `${sensitivityPercent}%` }}
          title={`Rx Sensitivity: ${CONSTANTS.rxSensitivity} dBm`}
        />
        {/* Target marker */}
        <div
          className="absolute inset-y-0 w-0.5 bg-yellow-600"
          style={{ left: `${targetPercent}%` }}
          title={`Target Max: ${CONSTANTS.targetMax} dBm`}
        />
        {/* Rx Power point */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-md z-10"
          style={{ left: `${rxPercent}%` }}
          title={`Rx Power: ${rxPower.toFixed(2)} dBm`}
        />
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-red-600">Fail (&lt; -28)</span>
        <span className="text-yellow-600">Warning (-28 ~ -22)</span>
        <span className="text-green-600">OK (&gt;= -22)</span>
      </div>
    </div>
  );
}

export default function PowerBudgetPage() {
  const powerBudget = usePowerBudget();

  const [fiberKm, setFiberKm] = useState(5);
  const [splices, setSplices] = useState(2);
  const [connectors, setConnectors] = useState(4);
  const [splitters, setSplitters] = useState<string[]>(["1:8"]);
  const [result, setResult] = useState<BudgetResult | null>(null);
  const [localBreakdown, setLocalBreakdown] = useState<{
    fiberLoss: number;
    spliceLoss: number;
    connectorLoss: number;
    splitterLoss: number;
  } | null>(null);

  const addSplitter = () => setSplitters((prev) => [...prev, "1:8"]);
  const removeSplitter = (index: number) =>
    setSplitters((prev) => prev.filter((_, i) => i !== index));
  const updateSplitter = (index: number, value: string) =>
    setSplitters((prev) => prev.map((s, i) => (i === index ? value : s)));

  const handleCalculate = async () => {
    // Compute local breakdown for display
    const fLoss = fiberKm * CONSTANTS.fiberLoss;
    const sLoss = splices * CONSTANTS.spliceLoss;
    const cLoss = connectors * CONSTANTS.connectorLoss;
    const spLoss = splitters.reduce(
      (acc, r) => acc + (CONSTANTS.splitterLoss[r] ?? 0),
      0
    );
    setLocalBreakdown({
      fiberLoss: fLoss,
      spliceLoss: sLoss,
      connectorLoss: cLoss,
      splitterLoss: spLoss,
    });

    try {
      const res = await powerBudget.mutateAsync({
        fiberKm,
        splices,
        connectors,
        splitters,
      });
      setResult(res);
    } catch {
      // Fallback: compute locally
      const totalLoss = fLoss + sLoss + cLoss + spLoss;
      const rxPower = CONSTANTS.gponOutput - totalLoss;
      let status = "OK";
      if (rxPower < CONSTANTS.rxSensitivity) status = "Fail";
      else if (rxPower < CONSTANTS.targetMax) status = "Warning";
      setResult({ totalLoss, rxPower, status });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Power Budget Calculator</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Kalkulator power budget untuk jaringan FTTH GPON
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Parameter Input</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Panjang Fiber (km)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={fiberKm}
                onChange={(e) => setFiberKm(parseFloat(e.target.value) || 0)}
                placeholder="5"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Jumlah Splice</Label>
                <Input
                  type="number"
                  min="0"
                  value={splices}
                  onChange={(e) => setSplices(parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label>Jumlah Konektor</Label>
                <Input
                  type="number"
                  min="0"
                  value={connectors}
                  onChange={(e) => setConnectors(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Splitter</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSplitter}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Tambah
                </Button>
              </div>
              {splitters.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Belum ada splitter ditambahkan
                </p>
              )}
              {splitters.map((ratio, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    value={ratio}
                    onChange={(e) => updateSplitter(index, e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  >
                    {SPLITTER_RATIOS.map((r) => (
                      <option key={r} value={r}>
                        {r} ({CONSTANTS.splitterLoss[r]} dB)
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Hapus splitter"
                    onClick={() => removeSplitter(index)}
                    className="shrink-0 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              onClick={handleCalculate}
              disabled={powerBudget.isPending}
              className="w-full"
            >
              <Calculator className="h-4 w-4 mr-2" />
              {powerBudget.isPending ? "Menghitung..." : "Hitung Power Budget"}
            </Button>
          </CardContent>
        </Card>

        {/* Constants Reference */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Konstanta Referensi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Parameter</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Nilai</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="px-4 py-2">GPON Output</td>
                    <td className="px-4 py-2 text-right font-mono">+8 dBm</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">Fiber Loss</td>
                    <td className="px-4 py-2 text-right font-mono">0.35 dB/km</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">Splice Loss</td>
                    <td className="px-4 py-2 text-right font-mono">0.1 dB/splice</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">Connector Loss</td>
                    <td className="px-4 py-2 text-right font-mono">0.5 dB/connector</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">Splitter Loss 1:2</td>
                    <td className="px-4 py-2 text-right font-mono">3.5 dB</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">Splitter Loss 1:4</td>
                    <td className="px-4 py-2 text-right font-mono">7.0 dB</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">Splitter Loss 1:8</td>
                    <td className="px-4 py-2 text-right font-mono">10.5 dB</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">Splitter Loss 1:16</td>
                    <td className="px-4 py-2 text-right font-mono">13.5 dB</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">Splitter Loss 1:32</td>
                    <td className="px-4 py-2 text-right font-mono">17.0 dB</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">Rx Sensitivity</td>
                    <td className="px-4 py-2 text-right font-mono">-28 dBm</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2">Target Max</td>
                    <td className="px-4 py-2 text-right font-mono">-22 dBm</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-3">
                Hasil Perhitungan
                {getStatusBadge(result.status)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-lg border p-4 text-center">
                  <p className="text-xs text-muted-foreground">GPON Output</p>
                  <p className="text-xl font-bold font-mono text-green-600">+8 dBm</p>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <p className="text-xs text-muted-foreground">Total Loss</p>
                  <p className="text-xl font-bold font-mono text-orange-600">
                    {result.totalLoss.toFixed(2)} dB
                  </p>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <p className="text-xs text-muted-foreground">Rx Power</p>
                  <p
                    className={`text-xl font-bold font-mono ${
                      result.status === "OK"
                        ? "text-green-600"
                        : result.status === "Warning"
                        ? "text-yellow-600"
                        : "text-red-600"
                    }`}
                  >
                    {result.rxPower.toFixed(2)} dBm
                  </p>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <div className="mt-1">{getStatusBadge(result.status)}</div>
                </div>
              </div>

              {/* Power Bar */}
              <div>
                <p className="text-sm font-medium mb-3">Visualisasi Power Budget</p>
                <PowerBar rxPower={result.rxPower} />
              </div>

              {/* Loss Breakdown */}
              {localBreakdown && (
                <div>
                  <p className="text-sm font-medium mb-3">Rincian Loss</p>
                  <div className="rounded-lg border overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                            Komponen
                          </th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                            Detail
                          </th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                            Loss (dB)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="px-4 py-2">Fiber</td>
                          <td className="px-4 py-2 text-right text-muted-foreground font-mono">
                            {fiberKm} km x 0.35 dB/km
                          </td>
                          <td className="px-4 py-2 text-right font-mono font-medium">
                            {localBreakdown.fiberLoss.toFixed(2)}
                          </td>
                        </tr>
                        <tr className="border-b">
                          <td className="px-4 py-2">Splice</td>
                          <td className="px-4 py-2 text-right text-muted-foreground font-mono">
                            {splices} x 0.1 dB
                          </td>
                          <td className="px-4 py-2 text-right font-mono font-medium">
                            {localBreakdown.spliceLoss.toFixed(2)}
                          </td>
                        </tr>
                        <tr className="border-b">
                          <td className="px-4 py-2">Konektor</td>
                          <td className="px-4 py-2 text-right text-muted-foreground font-mono">
                            {connectors} x 0.5 dB
                          </td>
                          <td className="px-4 py-2 text-right font-mono font-medium">
                            {localBreakdown.connectorLoss.toFixed(2)}
                          </td>
                        </tr>
                        {splitters.map((ratio, i) => (
                          <tr key={i} className="border-b">
                            <td className="px-4 py-2">Splitter {i + 1}</td>
                            <td className="px-4 py-2 text-right text-muted-foreground font-mono">
                              {ratio}
                            </td>
                            <td className="px-4 py-2 text-right font-mono font-medium">
                              {(CONSTANTS.splitterLoss[ratio] ?? 0).toFixed(1)}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-muted/30 font-bold">
                          <td className="px-4 py-2" colSpan={2}>
                            Total Loss
                          </td>
                          <td className="px-4 py-2 text-right font-mono">
                            {result.totalLoss.toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
