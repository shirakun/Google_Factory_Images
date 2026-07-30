import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { DEVICE_RELEASE_DATES, releaseDateKey } from './device-release-dates';

// Schema v1 entries are length-2; schema v2 entries are length-4.
type LegacyFwEntry   = [string, string | string[]];
type EnrichedFwEntry = [string, string | string[], string | null, string | null];
type FwEntry = LegacyFwEntry | EnrichedFwEntry;

interface DeviceEntry {
  name: string;
  factory: EnrichedFwEntry[];
  ota: EnrichedFwEntry[];
}

interface DataJson {
  schemaVersion: number;
  generatedAt: string;
  sourceRevision: string;
  counts: { devices: number; factory: number; ota: number };
  devices: Record<string, DeviceEntry>;
}

// Upgrade a legacy 2-element tuple to the canonical 4-element form.
function normEntry(e: FwEntry): EnrichedFwEntry {
  return [e[0], e[1], (e as EnrichedFwEntry)[2] ?? null, (e as EnrichedFwEntry)[3] ?? null];
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  data = signal<DataJson | null>(null);

  sortedDevices = computed(() => {
    const d = this.data();
    if (!d) return [];
    return Object.entries(d.devices).sort((a, b) => {
      const da = this.releaseKey(a[0], a[1]);
      const db = this.releaseKey(b[0], b[1]);
      if (da !== db) return db - da;
      return a[1].name.localeCompare(b[1].name, undefined, { numeric: true });
    });
  });

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.http.get<{
      schemaVersion: number;
      generatedAt: string;
      sourceRevision: string;
      counts: { devices: number; factory: number; ota: number };
      devices: Record<string, { name: string; factory: FwEntry[]; ota: FwEntry[] }>;
    }>('./assets/data.json').subscribe({
      next: raw => {
        const devices: Record<string, DeviceEntry> = {};
        for (const [code, dev] of Object.entries(raw.devices)) {
          devices[code] = {
            name: dev.name,
            factory: dev.factory.map(normEntry),
            ota: dev.ota.map(normEntry),
          };
        }
        this.data.set({ ...raw, devices });
      },
      error: () => console.error('Failed to load data.json'),
    });
  }

  isSharded(entry: EnrichedFwEntry): boolean {
    return Array.isArray(entry[1]);
  }

  getUrls(entry: EnrichedFwEntry): string[] {
    return Array.isArray(entry[1]) ? entry[1] : [entry[1]];
  }

  getFilename(url: string): string {
    return url.split('/').pop() ?? url;
  }

  getChecksum(entry: EnrichedFwEntry): string | null {
    return entry[2];
  }

  getFlashUrl(entry: EnrichedFwEntry): string | null {
    return entry[3];
  }

  private releaseKey(codename: string, dev: DeviceEntry): number {
    const d = DEVICE_RELEASE_DATES[codename];
    if (d) return releaseDateKey(d);
    const all = [...dev.factory, ...dev.ota];
    let best = Infinity;
    for (const e of all) {
      const parts = e[0].split('.');
      if (parts.length >= 2 && /^\d{6}$/.test(parts[1])) {
        const yyyymm = parseInt('20' + parts[1].slice(0, 4), 10);
        if (yyyymm < best) best = yyyymm;
      }
    }
    return best === Infinity ? 0 : best;
  }
}
