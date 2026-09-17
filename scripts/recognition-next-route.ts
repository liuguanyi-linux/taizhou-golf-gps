// Installed only into the user's local clone. Remote deployments intentionally return 403.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const recognition = require('../../../../lib/golf-tool/recognition-local.cjs') as {response(request: Request): Promise<Response>};
export const GET = (request: Request) => recognition.response(request);
export const POST = (request: Request) => recognition.response(request);
