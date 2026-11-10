/**
 * Bukas Pasay's configuration: the only file a fork needs to edit.
 * What each field means: src/config.ts. Regenerate with `npm run setup`;
 * check it against the live API with `npm run check -- --verbose`.
 */
import { defineConfig } from './src/config';

export default defineConfig({
  id: 'bukas-pasay',
  kind: 'city',
  name: 'Pasay City',
  shortName: 'Bukas Pasay',
  operator: { name: 'Charles Togle', url: 'https://github.com/CharlesTogle' },
  siteUrl: 'https://bukas-pasay.6digits.dev',
  scope: {
    // No DPWH office in scope. The FY2027 documents list Pasay's lines under
    // the South Manila District Engineering Office, which also serves part of
    // Manila; adding it would show Manila projects as Pasay's. The place query
    // below picks up the Pasay lines by title instead (all checked 2026-11-09).
    places: [{ label: 'Pasay', q: 'Pasay', region: 'NCR' }],
    districts: ['leg:pasay-city:lone'], // confirmed by `npm run check`: Pasay City, Lone District
    exclude: [],
  },
  reporting: { enabled: false },
});
