/**
 * The portal's Tagalog words for the API's terms. The API's own English
 * wording stays available (as a tooltip or in the CSV); these are for reading.
 */
import type { BridgeGroup } from '../api/types';

export const NEP = 'Mungkahi ng Pangulo';
export const HOUSE = 'Bersyon ng Kamara';

/** What the House bill did to a project, compared with the President's proposal. */
export const GROUPS: Record<BridgeGroup, { label: string; sub: string; help: string }> = {
  house_only: {
    label: 'Nasa Kamara lang',
    sub: 'posibleng idinagdag',
    help: 'Nasa bersyon ng Kamara pero hindi namin nakita sa mungkahi ng Pangulo. Maaaring bago ito, o pinalitan lang ang pangalan o saklaw, kaya “posible” pa lang.',
  },
  nep_only: {
    label: 'Nasa Pangulo lang',
    sub: 'posibleng tinanggal',
    help: 'Nasa mungkahi ng Pangulo pero hindi namin nakita sa bersyon ng Kamara. Maaaring tinanggal, pinalitan ang pangalan, o isinama sa iba, kaya “posible” pa lang.',
  },
  unchanged: {
    label: 'Parehong halaga',
    sub: 'walang binago',
    help: 'Nasa dalawang bersyon, at pareho ang halaga.',
  },
  increased: {
    label: 'Dinagdagan',
    sub: 'mas malaki sa Kamara',
    help: 'Nasa dalawang bersyon, at mas malaki ang halaga sa bersyon ng Kamara.',
  },
  decreased: {
    label: 'Binawasan',
    sub: 'mas maliit sa Kamara',
    help: 'Nasa dalawang bersyon, at mas maliit ang halaga sa bersyon ng Kamara.',
  },
  scope_review: {
    label: 'Ibang bahagi ng kalsada',
    sub: 'hindi binilang na pagbabago',
    help: 'Parehong kalsada ang nasa dalawang bersyon, pero magkaibang bahagi nito. Hindi maikukumpara ang halaga, kaya hindi ito isinama sa mga dinagdagan o binawasan.',
  },
};
