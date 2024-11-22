const esbuild = require('esbuild');
const path = require('path');

// Build configuration
const buildConfig = {
    entryPoints: ['src/js/content.js'],
    bundle: true,
    outfile: 'src/js/bundle.js',
    format: 'iife',
    platform: 'browser',
    target: ['chrome89'], // Target modern Chrome versions
    minify: process.env.NODE_ENV === 'production',
    sourcemap: process.env.NODE_ENV !== 'production',
    loader: {
        '.js': 'jsx'
    },
    define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
    }
};

// Build function
async function build() {
    try {
        await esbuild.build(buildConfig);
        console.log('Build completed successfully!');
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

// Watch function for development
async function watch() {
    try {
        const context = await esbuild.context(buildConfig);
        await context.watch();
        console.log('Watching for changes...');
    } catch (error) {
        console.error('Watch setup failed:', error);
        process.exit(1);
    }
}

// Run build or watch based on command line argument
if (process.argv.includes('--watch')) {
    watch();
} else {
    build();
}
