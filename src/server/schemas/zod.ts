/*
 * Shared Zod instance with OpenAPI support enabled.
 *
 * extendZodWithOpenApi() must run once, before any `.openapi(...)` call. Every
 * schema module imports `z` from HERE (not from 'zod' directly) so the
 * extension is guaranteed to be applied.
 */
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export { z };
