export const cleanBarcode=value=>String(value||'').replace(/\D/g,'');
export const validQuantity=value=>Number.isInteger(Number(value))&&Number(value)>=1&&Number(value)<=2147483647;
export function searchCatalog(products,query){const terms=query.trim().toLocaleLowerCase('ru').replace(/ё/g,'е').split(/\s+/).filter(Boolean);if(!terms.length)return[];return products.filter(p=>{const text=`${p.name||''} ${p.brand||''}`.toLocaleLowerCase('ru').replace(/ё/g,'е');return terms.every(t=>text.includes(t))}).slice(0,12)}
export function existingParty(items,barcode,store,expiry){return items.find(x=>!x.is_disposed&&cleanBarcode(x.products?.barcode)===cleanBarcode(barcode)&&x.store_id===store&&x.expiry_date===expiry)}
