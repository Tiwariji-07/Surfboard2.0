# 🏄‍♂️ Surfboard.AI - WaveMaker Development Assistant

![Surfboard.AI Logo](src/icons/sticker.png)

A Chrome extension designed to enhance the WaveMaker low-code development experience with intelligent coding assistance and contextual suggestions.

## ✨ Features

### 🤖 AI-Powered Assistance
- Real-time code completion
- Context-aware suggestions
- Intelligent code predictions
- WaveMaker-specific assistance
- Multi-language support (JavaScript, HTML, CSS)

### 💻 User Interface
- Monaco Editor integration
- Inline code completions
- Debounced suggestions
- Non-intrusive UI
- Responsive design

### 🔒 Security
- Secure API key management
- Environment-based configuration
- No sensitive data storage
- HTTPS-only communication

## 🚀 Getting Started

### Prerequisites
- Google Chrome browser
- WaveMaker development environment
- LiteLLM proxy or gateway access
- Node.js and npm installed

### Installation for Development

1. Clone the repository:
```bash
git clone https://github.com/yourusername/wavemaker-copilot.git
cd wavemaker-copilot
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```
Edit `.env` and add your LiteLLM settings if you use environment-based local development.

4. Build the extension:
```bash
npm run build
```

5. Load in Chrome:
- Open Chrome and go to `chrome://extensions`
- Enable "Developer mode"
- Click "Load unpacked"
- Select the `dist` directory

### Building for Production

1. Ensure all dependencies are installed:
```bash
npm install
```

2. Create production build:
```bash
npm run build:prod
```

3. The extension will be built in the `dist` directory
4. You can then zip the dist directory for distribution

## 🛠️ Technical Details

### Architecture
- Chrome Extension Manifest V3
- Monaco Editor integration
- LiteLLM-compatible chat completions endpoint
- Event-driven messaging

### Components
- **AI Service**
  - LiteLLM API integration
  - Completion generation
  - Context management

- **Completion Manager**
  - Monaco Editor integration
  - Context extraction
  - Debounced suggestions

- **Monaco Helper**
  - Editor initialization
  - Event handling
  - Completion rendering

### Project Structure
```
wavemaker-copilot/
├── manifest.json
├── src/
│   ├── css/
│   │   ├── sidebar.css
│   │   ├── completion.css
│   │   └── prism-vscode-dark.css
│   ├── js/
│   │   ├── services/
│   │   │   └── aiService.js
│   │   ├── completion/
│   │   │   └── completionManager.js
│   │   ├── inject/
│   │   │   └── monacoHelper.js
│   │   ├── ui/
│   │   │   └── sidebar.js
│   │   └── content.js
│   └── icons/
│       └── sticker.png
├── .env.example
├── .gitignore
└── package.json
```

## 🔧 Development

### Available Scripts

- `npm run build`: Build development version
- `npm run build:prod`: Build production version
- `npm run watch`: Watch for changes and rebuild
- `npm run lint`: Run ESLint
- `npm test`: Run tests

### Configuration

1. Environment Variables (`.env`):
```env
LITELLM_API_KEY=your-api-key-here
LITELLM_BASE_URL=http://localhost:4000
EXTENSION_ENV=development
DEBUG_MODE=false
```

2. Build Configuration:
- Development build includes source maps
- Production build is minified and optimized
- Watch mode for development

### Best Practices

1. **API Key Management**:
   - Never commit API keys
   - Use environment variables for local development when needed
   - Store LiteLLM keys securely in extension storage

2. **Code Style**:
   - Follow ESLint configuration
   - Use consistent formatting
   - Write meaningful comments

3. **Testing**:
   - Test all new features
   - Ensure backward compatibility
   - Verify API integration

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.
