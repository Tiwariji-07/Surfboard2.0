# 🏄‍♂️ Surfboard.AI - WaveMaker Development Assistant

![Surfboard.AI Logo](src/icons/sticker.png)

A powerful AI-powered Chrome extension designed to enhance the WaveMaker low-code development experience with intelligent coding assistance and contextual suggestions.

## ✨ Features

### 🤖 AI-Powered Assistance
- Real-time coding suggestions
- Context-aware development help
- Best practices recommendations
- Code optimization tips
- WaveMaker-specific guidance

### 💻 User Interface
- Floating action button for quick access
- Collapsible sidebar interface
- Dark/light theme support
- Responsive chat interface
- Code snippet formatting

### 🔒 Security
- Secure API key storage
- Client-side processing
- No data retention
- HTTPS-only communication

## 🚀 Getting Started

### Prerequisites
- Google Chrome browser
- WaveMaker development environment
- Groq API key ([Get one here](https://console.groq.com))

### Installation
1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. Click the extension icon and enter your Groq API key

## 🛠️ Technical Details

### Architecture
- Chrome Extension Manifest V3
- Class-based JavaScript components
- Event-driven communication
- Modular design pattern

### Components
- **Background Service**
  - Extension lifecycle management
  - Cross-tab communication
  - API key management

- **Content Scripts**
  - UI initialization
  - Context parsing
  - Event handling

- **Chat Interface**
  - AI message processing
  - Code formatting
  - Context management

### AI Integration
- Uses Groq's Llama3 model
- OpenAI-compatible API
- Streaming responses
- Context window: 8192 tokens

## 🔧 Development

### Project Structure
\`\`\`
wavemaker-copilot/
├── manifest.json
├── src/
│   ├── css/
│   │   └── copilot.css
│   ├── html/
│   │   ├── popup.html
│   │   └── welcome.html
│   ├── icons/
│   │   └── sticker.png
│   └── js/
│       ├── background.js
│       ├── content.js
│       └── ui/
│           ├── chat.js
│           └── sidebar.js
└── assets/
    └── icon.png
\`\`\`

### Building
1. Make changes to source files
2. Test in Chrome using "Load unpacked"
3. Package for distribution when ready

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- WaveMaker community
- Groq AI team
- Chrome Extensions documentation
- All contributors

## 📞 Support

For support:
- Open an issue on GitHub
- Contact the development team
- Check our documentation

---

Made with ❤️ for the WaveMaker community
