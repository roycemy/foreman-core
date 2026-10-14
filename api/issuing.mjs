import handler from '../issuer-webhook.cjs';
// Web-standard Request preserves the signature's exact bytes on Vercel.
export async function POST(request) {
 const headers={};let status=200,body;
 const raw=Buffer.from(await request.arrayBuffer());
 if(raw.length>262144)return Response.json({error:'Too large'},{status:413});
 await handler({method:'POST',body:raw,headers:{'stripe-signature':request.headers.get('stripe-signature')}},{setHeader(k,v){headers[k]=v},status(n){status=n;return this},json(value){body=value;return value}});
 return Response.json(body,{status,headers});
}
export function GET(){return Response.json({mode:'stripe_test_only',liveEnabled:false,note:'Signed Stripe sandbox POST only. No issuer delivery verified.'},{headers:{'Cache-Control':'no-store'}})}
