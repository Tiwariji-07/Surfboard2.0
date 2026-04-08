const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const distDir = path.join(projectRoot, 'dist');
const sourceBundlePath = path.join(projectRoot, 'src/js/bundle.js');
const sourceBundleMapPath = path.join(projectRoot, 'src/js/bundle.js.map');
const distBundlePath = path.join(distDir, 'src/js/bundle.js');
const distBundleMapPath = path.join(distDir, 'src/js/bundle.js.map');

const buildConfig = {
    entryPoints: ['src/js/content.js'],
    bundle: true,
    outfile: sourceBundlePath,
    format: 'iife',
    platform: 'browser',
    target: ['chrome89'],
    minify: process.env.NODE_ENV === 'production',
    sourcemap: process.env.NODE_ENV !== 'production',
    loader: {
        '.js': 'jsx'
    },
    define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
    }
};

function ensureDirectory(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function cleanDist() {
    fs.rmSync(distDir, { recursive: true, force: true });
}

function copyFileToDist(relativePath) {
    const sourcePath = path.join(projectRoot, relativePath);
    const targetPath = path.join(distDir, relativePath);
    ensureDirectory(path.dirname(targetPath));
    fs.copyFileSync(sourcePath, targetPath);
}

function copyDirectoryToDist(relativePath) {
    const sourcePath = path.join(projectRoot, relativePath);
    const targetPath = path.join(distDir, relativePath);
    fs.cpSync(sourcePath, targetPath, { recursive: true });
}

function copyStaticAssets() {
    copyFileToDist('manifest.json');
    copyDirectoryToDist('assets');
    copyDirectoryToDist('src/css');
    copyDirectoryToDist('src/html');
    copyDirectoryToDist('src/icons');

    [
        'src/js/background.js',
        'src/js/constants/editAgent.js',
        'src/js/constants/litellm.js',
        'src/js/constants/studio.js',
        'src/js/popup.js',
        'src/js/prism.js',
        'src/js/constants/messages.js',
        'src/js/context/pageContext.js',
        'src/js/inject/monacoHelper.js',
        'src/js/inject/networkMonitor.js',
        'src/js/parser/wmParser.js',
        'src/js/services/aiService.js',
        'src/js/services/editAgentService.js',
        'src/js/services/errorMonitorService.js',
        'src/js/services/logService.js',
        'src/js/services/openaiService.js',
        'src/js/services/searchService.js',
        'src/js/services/studioApiService.js',
        'src/js/ui/logPanel.js',
        'src/js/ui/searchPanel.js',
        'src/js/ui/sidebar.js'
    ].forEach(copyFileToDist);
}

function prepareDist() {
    cleanDist();
    copyStaticAssets();
    ensureDirectory(path.join(distDir, 'src/js'));
}

function copyBundleToDist() {
    ensureDirectory(path.dirname(distBundlePath));
    fs.copyFileSync(sourceBundlePath, distBundlePath);

    if (fs.existsSync(sourceBundleMapPath)) {
        fs.copyFileSync(sourceBundleMapPath, distBundleMapPath);
    }
}

async function build() {
    try {
        prepareDist();
        await esbuild.build(buildConfig);
        copyBundleToDist();
        console.log('Build completed successfully!');
        console.log(`Extension package available at ${distDir}`);
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

async function watch() {
    try {
        prepareDist();
        const context = await esbuild.context(buildConfig);
        await context.watch();
        copyBundleToDist();
        console.log(`Watching for changes and writing output to ${distDir}`);
    } catch (error) {
        console.error('Watch setup failed:', error);
        process.exit(1);
    }
}

if (process.argv.includes('--watch')) {
    watch();
} else {
    build();
}
