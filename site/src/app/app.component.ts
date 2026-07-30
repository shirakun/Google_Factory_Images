import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DEVICE_RELEASE_DATES, WATCH_CODENAMES, releaseDateKey } from './device-release-dates';

interface DeviceEntry {
  name: string;
  factory: FwEntry[];
  ota: FwEntry[];
}

type FwEntry = [string, string | string[]];
type CategoryTab = 'phones' | 'watch';

interface DataJson {
  schemaVersion: number;
  generatedAt: string;
  sourceRevision: string;
  counts: { devices: number; factory: number; ota: number };
  devices: Record<string, DeviceEntry>;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  data = signal<DataJson | null>(null);
  expandedDevice = signal<string | null>(null);
  searchQuery = signal<string>('');
  categoryTab = signal<CategoryTab>('phones');
  private deviceTabs = new Map<string, 'factory' | 'ota'>();
  copyStates = new Map<string, boolean>();

  sortedDevices = computed(() => {
    const d = this.data();
    if (!d) return [];
    const category = this.categoryTab();
    const q = this.searchQuery().toLowerCase();
    return Object.entries(d.devices)
      .filter(([codename]) => WATCH_CODENAMES.has(codename) === (category === 'watch'))
      .filter(([codename, dev]) =>
        !q || dev.name.toLowerCase().includes(q) || codename.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const da = this.getDeviceReleaseDate(a[0], a[1]);
        const db = this.getDeviceReleaseDate(b[0], b[1]);
        if (da !== db) return db - da;
        return a[1].name.localeCompare(b[1].name, undefined, { numeric: true });
      });
  });

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.http.get<DataJson>('./assets/data.json').subscribe({
      next: d => {
        this.data.set(d);
        const params = new URLSearchParams(window.location.search);
        const device = params.get('device');
        if (device && d.devices[device]) {
          this.setCategoryTab(WATCH_CODENAMES.has(device) ? 'watch' : 'phones');
          this.expandDevice(device);
          setTimeout(() => {
            document.getElementById('device-' + device)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 50);
        }
      },
      error: () => console.error('Failed to load data.json')
    });
  }

  setCategoryTab(tab: CategoryTab): void {
    this.categoryTab.set(tab);
    this.expandedDevice.set(null);
  }

  toggleDevice(codename: string): void {
    if (this.expandedDevice() === codename) {
      this.expandedDevice.set(null);
    } else {
      this.expandDevice(codename);
    }
  }

  private expandDevice(codename: string): void {
    this.expandedDevice.set(codename);
    if (!this.deviceTabs.has(codename)) {
      const dev = this.data()?.devices[codename];
      this.deviceTabs.set(codename, dev && dev.factory.length > 0 ? 'factory' : 'ota');
    }
  }

  setTab(codename: string, tab: 'factory' | 'ota'): void {
    this.deviceTabs.set(codename, tab);
  }

  getTab(codename: string): 'factory' | 'ota' {
    return this.deviceTabs.get(codename) ?? 'factory';
  }

  getEntries(codename: string): FwEntry[] {
    const dev = this.data()?.devices[codename];
    if (!dev) return [];
    return this.getTab(codename) === 'factory' ? dev.factory : dev.ota;
  }

  isSharded(entry: FwEntry): boolean {
    return Array.isArray(entry[1]);
  }

  getUrls(entry: FwEntry): string[] {
    return Array.isArray(entry[1]) ? entry[1] : [entry[1]];
  }

  getFilename(url: string): string {
    return url.split('/').pop() ?? url;
  }

  getPartLabel(index: number, urls: string[]): string {
    return index === urls.length - 1 ? 'Manifest' : `Part ${index + 1}`;
  }

  async copyLinks(entry: FwEntry): Promise<void> {
    const buildId = entry[0];
    const text = this.getUrls(entry).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      this.copyStates.set(buildId, true);
      setTimeout(() => this.copyStates.set(buildId, false), 1500);
    } catch {
      // silent fail — clipboard requires HTTPS
    }
  }

  trackByCodename(_: number, item: [string, DeviceEntry]): string {
    return item[0];
  }

  trackByBuildId(_: number, entry: FwEntry): string {
    return entry[0];
  }

  trackByUrl(_: number, url: string): string {
    return url;
  }

  private getDeviceReleaseDate(codename: string, dev: DeviceEntry): number {
    // Primary: use official release date from static map.
    // Fallback: earliest buildId date heuristic (for devices not yet in the map).
    const releaseDate = DEVICE_RELEASE_DATES[codename];
    if (releaseDate) {
      return releaseDateKey(releaseDate);
    }

    // Fallback: earliest dated build ID (Android format XX4A.YYMMDD.NNN).
    // Normalize YYMMDD → YYYYMM to stay on the same scale as releaseDateKey().
    const all = [...dev.factory, ...dev.ota];
    let best = Infinity;
    for (const entry of all) {
      const parts = entry[0].split('.');
      if (parts.length >= 2 && /^\d{6}$/.test(parts[1])) {
        // parts[1] = YYMMDD → take YYMM, prepend century → YYYYMM
        const yyyymm = parseInt('20' + parts[1].slice(0, 4), 10);
        if (yyyymm < best) best = yyyymm;
      }
    }
    return best === Infinity ? 0 : best;
  }
}
