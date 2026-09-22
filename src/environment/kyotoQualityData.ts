import type { KyotoPlacement } from './kyotoArtData';
export const replacedByQuality = (p: KyotoPlacement) => (p.district === 2 || p.district === 3) && ['machiya_a','machiya_b','pagoda'].includes(p.asset);
export function qualityPlacements(original: KyotoPlacement[]): KyotoPlacement[] {
 let index=0;
 const result=original.filter(replacedByQuality).map(p=>({...p,asset:p.asset==='pagoda'?'Pagoda_Hero':['Machiya_A','Machiya_B','Corner_Machiya'][index++%3]}));
 // Two small independent storefronts complete the plaza courtyard, behind its perimeter.
 const pagoda=result.find(p=>p.asset==='Pagoda_Hero');
 if(pagoda){
  for(const [i,asset] of ['Kyoto_Shopfront_A','Kyoto_Shopfront_B'].entries())result.push({asset,position:[pagoda.position[0]-5+i*10,0,pagoda.position[2]-8],heading:0,scale:[1,1,1],district:2});
  for(const side of [-1,1])for(const offset of [-5,3])result.push({asset:'Traditional_Wall',position:[pagoda.position[0]+side*12,0,pagoda.position[2]+offset],heading:Math.PI/2,scale:[1,1,1],district:2});
 }
 return result;
}

