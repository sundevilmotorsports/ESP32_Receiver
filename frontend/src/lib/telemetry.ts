export interface TelemetryField { name: string; value: string; }
export interface DecodedTelemetry { label: string; fields: TelemetryField[]; }

const bytes = (hex: string): number[] => hex.split(" ").map(h => parseInt(h, 16));
const u16be = (b: number[], i: number) => (b[i] << 8) | b[i + 1];
const i16be = (b: number[], i: number) => { const v = u16be(b, i); return v > 32767 ? v - 65536 : v; };

function wheelFields(b: number[]): TelemetryField[] {
  return [
    { name: "Speed", value: u16be(b, 0) + " rpm" },
    { name: "Temp",  value: i16be(b, 2) + " °C"  },
    { name: "Load",  value: u16be(b, 4) + " N"   },
  ];
}

export function decode(key: string, raw: string): DecodedTelemetry | null {
  const b = bytes(raw);
  switch (key) {
    case "drs":       return { label: "DRS",     fields: [{ name: "State", value: b[0] ? "Open" : "Closed" }] };
    case "imu_gyro":  return { label: "Gyro",    fields: [{ name: "X", value: i16be(b,0) + " °/s" }, { name: "Y", value: i16be(b,2) + " °/s" }, { name: "Z", value: i16be(b,4) + " °/s" }] };
    case "imu_accel": return { label: "Accel",   fields: [{ name: "X", value: i16be(b,0) + " mg"  }, { name: "Y", value: i16be(b,2) + " mg"  }, { name: "Z", value: i16be(b,4) + " mg"  }] };
    case "wheel_fl":  return { label: "FL",      fields: wheelFields(b) };
    case "wheel_fr":  return { label: "FR",      fields: wheelFields(b) };
    case "wheel_rr":  return { label: "RR",      fields: wheelFields(b) };
    case "wheel_rl":  return { label: "RL",      fields: wheelFields(b) };
    case "sg_fl":     return { label: "FL",      fields: [{ name: "Pos", value: u16be(b, 0) + "" }] };
    case "sg_fr":     return { label: "FR",      fields: [{ name: "Pos", value: u16be(b, 0) + "" }] };
    case "sg_rr":     return { label: "RR",      fields: [{ name: "Pos", value: u16be(b, 0) + "" }] };
    case "sg_rl":     return { label: "RL",      fields: [{ name: "Pos", value: u16be(b, 0) + "" }] };
    case "eng_f0":    return { label: "Engine",  fields: [{ name: "ECT",  value: b[0] + " °C" }, { name: "Oil", value: u16be(b, 1) + " kPa" }] };
    case "eng_f1":    return { label: "Engine",  fields: [{ name: "TPS",  value: b[0] + "%" },   { name: "WSPD", value: u16be(b, 1) + " km/h" }] };
    case "eng_f2":    return { label: "Engine",  fields: [{ name: "APS",  value: b[0] + "%" }] };
    case "shifter":   return { label: "Shifter", fields: [{ name: "S0", value: b[0] + "" }, { name: "S1", value: b[1] + "" }, { name: "S2", value: b[2] + "" }] };
    default: return null;
  }
}

export const TELEM_SECTIONS: { title: string; keys: string[] }[] = [
  { title: "Engine",     keys: ["eng_f0", "eng_f1", "eng_f2", "drs", "shifter"] },
  { title: "IMU",        keys: ["imu_gyro", "imu_accel"] },
  { title: "Wheels",     keys: ["wheel_fl", "wheel_fr", "wheel_rr", "wheel_rl"] },
  { title: "Suspension", keys: ["sg_fl", "sg_fr", "sg_rr", "sg_rl"] },
];

export const TELEM_KEYS = [
  {k:"drs",b:1},{k:"imu_gyro",b:6},{k:"imu_accel",b:6},
  {k:"wheel_fl",b:6},{k:"wheel_fr",b:6},{k:"wheel_rr",b:6},{k:"wheel_rl",b:6},
  {k:"sg_fl",b:2},{k:"sg_fr",b:2},{k:"sg_rr",b:2},{k:"sg_rl",b:2},
  {k:"eng_f0",b:3},{k:"eng_f1",b:3},{k:"eng_f2",b:1},{k:"shifter",b:3},
];

