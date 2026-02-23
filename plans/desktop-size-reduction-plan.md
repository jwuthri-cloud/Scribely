# Desktop Folder Size Reduction Plan

## Current State Analysis

Based on the analysis of the `desktop/` folder, here are the identified size contributors:

### Large Files Identified

| File/Directory | Size | Description |
|----------------|------|-------------|
| `package-lock.json` | ~500 KB | NPM lock file (normal) |
| `resources/models/model.onnx` | ~42 MB | BERT question classifier model |
| `resources/native/NativeHelper` | ~3.8 MB | Compiled Swift binary |
| `native/.build/` | ~10+ MB | Swift build artifacts |
| `resources/icon.icns` | ~315 KB | macOS icon file |

### Estimated Size After Installation (1.3 GB)

The main contributors to the 1.3 GB installed size are:

1. **node_modules/** (~800-1000 MB) - Created after `npm install`
   - `onnxruntime-node` - Contains native binaries for ONNX runtime
   - `@huggingface/transformers` - Large ML library
   - `smart-whisper` - Whisper model for speech recognition
   - `electron` - Large framework (~200-300 MB)
   - `framer-motion` - Animation library

2. **native/.build/** - Swift build cache (can be cleaned)

3. **out/** - Build output directory (created during build)

---

## Size Reduction Recommendations

### Category 1: Quick Wins (Minimal Impact)

#### 1.1 Add native/.build/ to .gitignore (Already Done)
The `.gitignore` already excludes `native/.build/`. Ensure this is not committed.

#### 1.2 Clean Swift Build Cache
The `native/.build/` directory contains:
- `debug.yaml`, `release.yaml`, `plugin-tools.yaml` (~2 MB each)
- Compiled binaries and intermediate files

**Action:** Add a clean script to remove Swift build artifacts.

### Category 2: Dependency Optimization (Medium Impact)

#### 2.1 Replace `framer-motion` with CSS Animations
- **Current:** `framer-motion` (~500 KB minified + dependencies)
- **Alternative:** Use CSS transitions/animations or a lighter library like `motion` (the new framer-motion standalone)

**Estimated Savings:** ~300-500 KB in bundle size

#### 2.2 Evaluate `@huggingface/transformers` Usage
This is a large dependency. If only using for specific models:
- Consider loading models dynamically from CDN
- Use a smaller, specialized library for the specific task

**Estimated Savings:** ~50-100 MB in node_modules

#### 2.3 Replace `onnxruntime-node` with `onnxruntime-web`
- `onnxruntime-node` includes native binaries for multiple platforms
- `onnxruntime-web` uses WebAssembly and is smaller

**Note:** This may affect performance. Test thoroughly.

**Estimated Savings:** ~50-100 MB in node_modules

### Category 3: Model Optimization (High Impact)

#### 3.1 ONNX Model Optimization
The `model.onnx` file is ~42 MB. Options to reduce:

1. **Quantization:** Convert to INT8 quantized model
   - Can reduce size by ~4x (to ~10 MB)
   - Minimal accuracy loss for classification tasks

2. **Model Pruning:** Remove unused layers/weights

3. **Dynamic Loading:** Download model on first use instead of bundling

**Estimated Savings:** ~30 MB

#### 3.2 Download Models on Demand
Instead of bundling models in `resources/models/`:
- Download from CDN on first use
- Cache locally in user data directory

**Estimated Savings:** ~43 MB in bundle size

### Category 4: Build Configuration (Medium Impact)

#### 4.1 Enable Tree Shaking
Ensure Vite is configured for optimal tree shaking:
```typescript
// electron.vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ml: ['onnxruntime-node', '@huggingface/transformers'],
        }
      }
    }
  }
})
```

#### 4.2 Use Production Builds
Ensure all dependencies use production builds:
```json
// package.json
"scripts": {
  "build": "NODE_ENV=production electron-vite build"
}
```

### Category 5: Electron-Specific Optimizations

#### 5.1 Use Electron ASAR Archive
Ensure `asar: true` in electron-builder config (default).

#### 5.2 Exclude Unnecessary Files
Add to electron-builder config:
```json
{
  "build": {
    "files": [
      "!**/*.map",
      "!**/*.ts",
      "!**/node_modules/.cache/**",
      "!**/test/**",
      "!**/tests/**"
    ]
  }
}
```

---

## Recommended Action Plan

### Phase 1: Immediate Actions (Low Risk)

1. **Clean build artifacts** - Add npm script:
   ```json
   "clean": "rm -rf native/.build out dist node_modules/.cache"
   ```

2. **Update .gitignore** - Already properly configured

3. **Add build exclusions** - Update electron-builder config

### Phase 2: Model Optimization (Medium Risk)

1. **Quantize ONNX model** - Use `optimum` to create INT8 version
2. **Test accuracy** - Ensure classification still works correctly
3. **Update model loading code** - Point to new quantized model

### Phase 3: Dependency Audit (Higher Risk)

1. **Analyze bundle** - Use `electron-builder` size analysis
2. **Replace framer-motion** - If animations are simple
3. **Evaluate transformer alternatives** - If model loading can be deferred

---

## Estimated Total Savings

| Category | Estimated Savings |
|----------|-------------------|
| Build artifacts cleanup | ~10-20 MB |
| Model quantization | ~30 MB |
| Dependency optimization | ~100-200 MB |
| Build configuration | ~20-50 MB |
| **Total** | **~160-300 MB** |

---

## Questions for User

1. Is the question classifier model (`model.onnx`) critical for the app's core functionality?
2. Are there specific features that require `@huggingface/transformers`?
3. Is `framer-motion` heavily used, or could CSS animations suffice?
4. Would downloading models on first launch be acceptable?
