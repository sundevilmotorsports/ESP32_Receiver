import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { decode, TELEM_SECTIONS } from "@/lib/telemetry";

interface Props { telemMap: Record<string, string>; }

export function TelemetryPanel({ telemMap }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 items-start">
      {TELEM_SECTIONS.map(section => {
        const entries = section.keys.flatMap(k => {
          const d = decode(k, telemMap[k] ?? "");
          return d ? d.fields.map(f => ({ label: `${d.label} ${f.name}`, value: f.value })) : [];
        });
        if (!entries.length) return null;
        return (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">{section.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                {entries.map((e, i) => (
                  <div key={i} className="flex justify-between py-2">
                    <dt className="text-sm text-muted-foreground">{e.label}</dt>
                    <dd className="text-sm font-mono tabular-nums">{e.value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
