/**
 * Photographs of Pasay from Wikimedia Commons, under their own licences.
 * They stand in until the city or a local photographer supplies its own;
 * every one is credited in the footer (Credits in Chrome.tsx).
 */
export interface Photo {
  src: string;
  srcSet: string;
  width: number;
  height: number;
  /** What it shows, in Tagalog. */
  alt: string;
  by: string;
  licence: string;
  page: string;
}

const P = '/photos/photo-';

export const PHOTOS = {
  /** Roxas Boulevard and the CPP Complex, green, from above. */
  roxas: {
    src: `${P}f192473551-960.webp`,
    srcSet: `${P}f192473551-500.webp 500w, ${P}f192473551-960.webp 960w`,
    width: 960, height: 722,
    alt: 'Ang Roxas Boulevard at ang mga puno ng CPP Complex sa Pasay, kita mula sa itaas',
    by: 'Patrickroque01', licence: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Roxas_Boulevard_SB,_CPP_Complex,_Paranaque_skyline_drone_distant_RS_(Pasay_City;_12-25-2025).jpg',
  },
  /** Rooftops of Pasay along EDSA: where the barangays are. */
  rooftops: {
    src: `${P}f129072382-960.webp`,
    srcSet: `${P}f129072382-500.webp 500w, ${P}f129072382-960.webp 960w`,
    width: 960, height: 722,
    alt: 'Ang mga bubong ng mga barangay ng Pasay sa tabi ng EDSA, kita mula sa eroplano',
    by: 'Patrickroque01', licence: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:EDSA-Pasay_from_air_(Pasay;_01-09-2023).jpg',
  },
  /** Roxas Boulevard traffic: the roads DPWH builds and keeps. */
  road: {
    src: `${P}f54468556.webp`,
    srcSet: `${P}f54468556-500.webp 500w, ${P}f54468556-960.webp 960w, ${P}f54468556.webp 1280w`,
    width: 1280, height: 962,
    alt: 'Ang trapiko sa Roxas Boulevard sa Pasay, kita mula sa isang mataas na gusali',
    by: 'Patrick Roque', licence: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Roxas_Boulevard_-_Aerial_Shot_From_Legaspi_Towers_300_(Pasay_City;_2015-06-25).jpg',
  },
  /** Pasay City Hall on F.B. Harrison. */
  cityHall: {
    src: `${P}f49715378.webp`,
    srcSet: `${P}f49715378-500.webp 500w, ${P}f49715378-960.webp 960w, ${P}f49715378.webp 1280w`,
    width: 1280, height: 962,
    alt: 'Ang harapan ng Pasay City Hall sa F.B. Harrison',
    by: 'Judgefloro', licence: 'public domain',
    page: 'https://commons.wikimedia.org/wiki/File:01305jfNew_Pasay_City_Hall_Main_Facade_Harrison_Streetfvf_11.jpg',
  },
  /** Sunset over the water at Libertad. */
  libertad: {
    src: `${P}f118774858.webp`,
    srcSet: `${P}f118774858-500.webp 500w, ${P}f118774858-960.webp 960w, ${P}f118774858.webp 1280w`,
    width: 1280, height: 962,
    alt: 'Paglubog ng araw sa tubig sa Libertad, Pasay, may maliit na bangka',
    by: 'Jeoulian', licence: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:The_Sunset_in_Libertad.jpg',
  },
} satisfies Record<string, Photo>;

export const ALL_PHOTOS: Photo[] = Object.values(PHOTOS);
