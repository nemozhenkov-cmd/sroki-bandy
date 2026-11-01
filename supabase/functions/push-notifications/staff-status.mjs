// Only aggregate connection status leaves the server; endpoints and keys remain private.
export function staffPushStatus(actor,users,subscriptions){
 if(actor?.role!=='manager'||!actor.store_id)throw new Error('Manager access required');
 const connected=new Set(subscriptions.map(x=>x.user_id));
 return users.filter(u=>u.store_id===actor.store_id&&['rtz','srtz','srtz_rtz'].includes(u.role)&&u.id!==actor.id).map(u=>({user_id:u.id,enabled:connected.has(u.id)}));
}
