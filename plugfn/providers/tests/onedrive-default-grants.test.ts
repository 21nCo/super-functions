import { expect, it } from 'vitest';
import { onedriveProvider } from '../src/onedrive/index.js';
it('requests both literal OneDrive grants used by execution checks',()=>{
 expect((onedriveProvider.auth.config as any).scopes).toEqual(['offline_access','Files.Read','Files.ReadWrite']);
});
