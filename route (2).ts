import { sports } from '@/lib/radar';
export async function GET() { try { return Response.json({sports:await sports(),observedAt:Date.now()}); } catch(e) { return Response.json({error:e instanceof Error?e.message:'Błąd źródła'},{status:502}); } }
