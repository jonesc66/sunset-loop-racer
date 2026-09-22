import type {KyotoPlacement} from './kyotoArtData';
// User-reported asset correction: retain source position, rotation and scale.
export const replacesOrganicStreet=(p:KyotoPlacement)=>p.district===5&&(p.asset.startsWith('sakura_')||p.asset==='modern_apartment');
export const organicStreetPlacements=(items:KyotoPlacement[]):KyotoPlacement[]=>items.filter(replacesOrganicStreet).map(p=>({...p,asset:p.asset==='modern_apartment'?'Avenue_Apartment':p.asset==='sakura_a'?'Sakura_Boulevard_A':'Sakura_Boulevard_B'}));
