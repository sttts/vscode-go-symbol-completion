import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GoSymbolCache, GoSymbol } from './goSymbolCache';
import { afterEach, before, after, describe, it } from 'mocha';

describe('GoSymbolCache', () => {
    let tempDir: string;
    let cachePath: string;
    
    before(() => {
        // Create temporary directory for tests
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-symbol-tests-'));
        cachePath = path.join(tempDir, 'symbol-cache.json');
        console.log(`Test cache path: ${cachePath}`);
    });
    
    afterEach(() => {
        // Clean up after each test
        if (fs.existsSync(cachePath)) {
            fs.unlinkSync(cachePath);
        }
    });
    
    after(() => {
        // Remove the temp directory
        fs.rmdirSync(tempDir, { recursive: true });
    });
    
    describe('Cache file handling', () => {
        it('should save and load cache correctly', async () => {
            // Create a test cache instance with mocked paths
            const cache = new GoSymbolCache();
            
            // We need to access private properties for testing
            const privateCache = cache as any;
            privateCache.cachePath = cachePath;
            
            // Add some test symbols
            privateCache.symbols = new Map<string, GoSymbol[]>();
            privateCache.symbols.set('TestSymbol', [
                {
                    name: 'TestSymbol',
                    packagePath: 'test/package',
                    packageName: 'package',
                    kind: 'function',
                    isExported: true
                }
            ]);
            
            // Add some package versions
            privateCache.indexedPackages = new Map<string, string>();
            privateCache.indexedPackages.set('test/package', '1.0.0');
            privateCache.goVersion = '1.21.0';
            
            // Save the cache
            await privateCache.saveCacheToDisk();
            
            // Verify the cache file exists
            assert.strictEqual(fs.existsSync(cachePath), true, 'Cache file should exist after saving');
            
            // Read the cache file directly
            const fileContent = fs.readFileSync(cachePath, 'utf8');
            console.log(`Cache file content: ${fileContent}`);
            const cacheData = JSON.parse(fileContent);
            
            // Verify cache structure
            assert.strictEqual(cacheData.version, 1, 'Cache version should be 1');
            assert.strictEqual(cacheData.goVersion, '1.21.0', 'Go version should be set correctly');
            assert.ok(cacheData.timestamp > 0, 'Timestamp should be set');
            assert.deepStrictEqual(cacheData.packages, { 'test/package': '1.0.0' }, 'Packages should be saved correctly');
            assert.deepStrictEqual(cacheData.processedPackages, ['test/package'], 'Processed packages should be saved correctly');
            
            // Verify symbols are saved correctly
            assert.strictEqual(Object.keys(cacheData.symbols).length, 1, 'One symbol should be saved');
            assert.strictEqual(cacheData.symbols.TestSymbol[0].name, 'TestSymbol', 'Symbol name should be saved correctly');
            
            // Create a new cache instance to test loading
            const newCache = new GoSymbolCache();
            const privateNewCache = newCache as any;
            privateNewCache.cachePath = cachePath;
            privateNewCache.goVersion = '1.21.0';
            
            // Load the cache
            const loadResult = await privateNewCache.loadCacheFromDisk();
            assert.strictEqual(loadResult, true, 'Cache should load successfully');
            
            // Verify symbol was loaded
            assert.strictEqual(privateNewCache.symbols.size, 1, 'One symbol should be loaded');
            assert.strictEqual(privateNewCache.symbols.get('TestSymbol')[0].name, 'TestSymbol', 
                'Symbol name should be loaded correctly');
            assert.strictEqual(privateNewCache.indexedPackages.size, 1, 'One package should be loaded');
        });
        
        it('should handle cache version mismatch', async () => {
            // Create invalid cache data with wrong version
            const invalidCacheData = {
                version: 999,  // Wrong version
                goVersion: '1.21.0',
                timestamp: Date.now(),
                packages: { 'test/package': '1.0.0' },
                symbols: {}
            };
            
            // Write invalid cache to file
            fs.writeFileSync(cachePath, JSON.stringify(invalidCacheData));
            
            // Try to load the cache
            const cache = new GoSymbolCache();
            const privateCache = cache as any;
            privateCache.cachePath = cachePath;
            privateCache.goVersion = '1.21.0';
            
            const loadResult = await privateCache.loadCacheFromDisk();
            assert.strictEqual(loadResult, false, 'Cache should not load with version mismatch');
        });
        
        it('should handle Go version change', async () => {
            // Create cache data with different Go version
            const cacheData = {
                version: 1,
                goVersion: '1.19.0',  // Different Go version
                timestamp: Date.now(),
                packages: { 'test/package': '1.0.0' },
                symbols: {},
                processedPackages: ['test/package']
            };
            
            // Write cache to file
            fs.writeFileSync(cachePath, JSON.stringify(cacheData));
            
            // Try to load the cache
            const cache = new GoSymbolCache();
            const privateCache = cache as any;
            privateCache.cachePath = cachePath;
            privateCache.goVersion = '1.21.0';  // Current Go version
            
            const loadResult = await privateCache.loadCacheFromDisk();
            assert.strictEqual(loadResult, false, 'Cache should not load with Go version mismatch');
        });
        
        it('should handle empty cache gracefully', async () => {
            // Create an empty cache file
            fs.writeFileSync(cachePath, '');
            
            // Try to load the cache
            const cache = new GoSymbolCache();
            const privateCache = cache as any;
            privateCache.cachePath = cachePath;
            
            const loadResult = await privateCache.loadCacheFromDisk();
            assert.strictEqual(loadResult, false, 'Empty cache should not load');
        });
        
        it('should handle corrupted JSON gracefully', async () => {
            // Create corrupted JSON
            fs.writeFileSync(cachePath, '{ "version": 1, "goVersion": "1.21.0", "bad_json');
            
            // Try to load the cache
            const cache = new GoSymbolCache();
            const privateCache = cache as any;
            privateCache.cachePath = cachePath;
            
            const loadResult = await privateCache.loadCacheFromDisk();
            assert.strictEqual(loadResult, false, 'Corrupted JSON should not load');
        });
    });
    
    describe('Symbol processing', () => {
        it('should correctly add symbols', () => {
            const cache = new GoSymbolCache();
            const privateCache = cache as any;
            
            // Test adding an exported symbol
            const exportedSymbol: GoSymbol = {
                name: 'ExportedFunc',
                packagePath: 'test/package',
                packageName: 'package',
                kind: 'function',
                isExported: true
            };
            
            privateCache.addSymbol(exportedSymbol);
            
            // Verify the symbol was added
            assert.strictEqual(privateCache.symbols.size, 1, 'Symbol map should have one entry');
            assert.strictEqual(privateCache.symbols.get('ExportedFunc').length, 1, 
                'Symbol should be added under its name');
            
            // Test adding a non-exported symbol (should be skipped)
            const nonExportedSymbol: GoSymbol = {
                name: 'privateFunc',
                packagePath: 'test/package',
                packageName: 'package',
                kind: 'function',
                isExported: false
            };
            
            privateCache.addSymbol(nonExportedSymbol);
            
            // Verify non-exported symbol wasn't added
            assert.strictEqual(privateCache.symbols.size, 1, 'Symbol map should still have one entry');
            assert.strictEqual(privateCache.symbols.has('privateFunc'), false, 
                'Non-exported symbol should not be added');
        });
    });
    
    describe('Package version detection', () => {
        it('should detect versions for non-standard packages', async () => {
            const cache = new GoSymbolCache();
            const privateCache = cache as any;
            
            // Mock go command executions
            const originalExecCommand = privateCache.execCommand;
            privateCache.execCommand = async (command: string, _options: any) => {
                if (command === 'go list -m all') {
                    return `
                        example.com/mymodule
                        github.com/user/repo v1.2.3
                        gitlab.com/group/project v0.5.0
                    `;
                } else if (command === 'go list -m -json github.com/user/repo') {
                    return `{"Path":"github.com/user/repo","Version":"v1.2.3","Time":"2023-01-15T12:00:00Z","Dir":"/path/to/repo","GoMod":"/path/to/go.mod","GoVersion":"1.21"}`;
                } else if (command === 'go list -m gitlab.com/group/project') {
                    return 'gitlab.com/group/project v0.5.0';
                } else if (command === 'go list -m cloud.google.com/go') {
                    return 'cloud.google.com/go v0.110.7';
                } else if (command === 'go list -m -json cloud.google.com/go/pubsub') {
                    return `{"Path":"cloud.google.com/go/pubsub","Version":"v1.33.0","Time":"2023-06-22T12:00:00Z","Dir":"/path/to/pubsub","GoMod":"/path/to/go.mod","GoVersion":"1.21"}`;
                }
                return '';
            };
            
            // Test with various package types
            const packages = [
                'github.com/user/repo',
                'github.com/user/repo/subpkg',
                'gitlab.com/group/project',
                'cloud.google.com/go/pubsub',
                'bitbucket.org/user/unknown',
                'example.com/mymodule'
            ];
            
            await privateCache.updatePackageVersions(packages);
            
            // Verify versions were detected
            assert.strictEqual(privateCache.indexedPackages.get('github.com/user/repo'), 'v1.2.3', 
                'Should detect version for GitHub package');
            assert.strictEqual(privateCache.indexedPackages.get('github.com/user/repo/subpkg'), 'v1.2.3', 
                'Should use parent module version for subpackage');
            assert.strictEqual(privateCache.indexedPackages.get('gitlab.com/group/project'), 'v0.5.0', 
                'Should detect version for GitLab package');
            assert.strictEqual(privateCache.indexedPackages.get('cloud.google.com/go/pubsub'), 'v1.33.0', 
                'Should detect version for Cloud package');
            assert.strictEqual(privateCache.indexedPackages.get('example.com/mymodule'), 'workspace', 
                'Should use workspace for main module');
            
            // Restore original exec function
            privateCache.execCommand = originalExecCommand;
        });
    });
}); 