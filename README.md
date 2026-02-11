# 🤖 AI Agent

A professional AI-powered coding assistant built with Node.js and Groq LLMs. Inspired by Claude and Codex, this agent provides intelligent code generation, file management, and task planning capabilities.

## ✨ Features

- **🤖 Multiple Groq Models**: Support for all available Groq models (Llama, Mixtral, Gemma, Qwen, DeepSeek)
- **📋 Two Agent Modes**:
  - **Build Mode**: Direct code generation with automatic file creation
  - **Plan Mode**: Step-by-step task planning with automatic execution
- **⚡ Auto-Execution**: Files are created, edited, and modified automatically without confirmation prompts
- **📁 File Operations**: Create, read, edit (replace/find-replace/insert/append), and delete files
- **🔄 Smart Overwrite**: Automatically overwrites existing files when creating new ones
- **⚡ Fast & Efficient**: Powered by Groq's lightning-fast LLM inference
- **💻 CLI Interface**: Interactive command-line interface with slash commands
- **🔧 Configurable**: Environment variables and config file support

## 🚀 Installation

```bash
# Clone or navigate to the project
cd "AI Agent"

# Install dependencies
npm install

# Set up your API key (choose one method)
export GROQ_API_KEY="your_api_key_here"
# OR create a .env file
echo "GROQ_API_KEY=your_api_key_here" > .env
```

## 🚀 Auto-Execution Features

This AI Agent **automatically creates, edits, reads, and deletes files** without asking for confirmation:

✅ **Natural Language**: Just describe what you want to build - files are created automatically  
✅ **Build Mode**: Code generation automatically saves files  
✅ **Plan Mode**: Plans auto-execute all file operations  
✅ **Smart Overwrite**: Existing files are overwritten when needed  
✅ **Direct Commands**: File operations execute immediately with `/create`, `/edit`, `/delete`

## 🎯 Usage

### Start the Agent

```bash
npm start
# or
npm run agent
# or
node src/index.js
```

### First-Time Setup

On first run, the agent will guide you through setup:
1. Enter your Groq API key
2. Choose your default model
3. Select your preferred agent mode

### Slash Commands

#### Model Management
- `/models` - List all available Groq models
- `/model <id>` - Switch to a specific model
- `/model` - Show current model

#### Agent Modes
- `/agents` - Show current mode
- `/agents plan` - Switch to planning mode
- `/agents build` - Switch to build mode

#### Planning
- `/plan <task>` - Create a step-by-step plan
- `/execute [plan-id]` - Execute a plan

#### File Operations
- `/files [path]` - List files in directory
- `/create <path> <content>` - Create a new file
- `/read <path>` - Read file contents
- `/edit <path> <mode>` - Edit a file
- `/delete <path>` - Delete a file

#### Other Commands
- `/clear` - Clear conversation history
- `/config` - Show configuration
- `/config apikey <key>` - Set API key
- `/help` - Show help
- `/exit` - Exit the agent

### Natural Language (Auto-Execution Enabled!)

In **Build Mode**, simply describe what you want to build and files are created automatically:

```
🔨 [build] > Create a React todo app with components and styles

📁 Auto-executing file operations:
✓ Created: src/App.js
✓ Created: src/components/TodoList.js
✓ Created: src/components/TodoItem.js
✓ Created: src/styles/App.css
```

In **Plan Mode**, describe complex tasks and they execute automatically:

```
📋 [plan] > Build a Node.js Express server with JWT auth

📝 Plan Created:
PLAN: Build a Node.js Express server with JWT authentication

STEPS:
1. Initialize npm project and install dependencies
2. Create server.js with Express setup
3. Implement JWT authentication middleware
4. Create protected routes

Use /execute to run this plan

📋 [plan] > /execute
🚀 Executing Plan: Build a Node.js Express server with JWT auth
✓ Created: package.json
✓ Created: server.js
✓ Created: middleware/auth.js
✓ Created: routes/auth.js
```

## 🎨 Available Models

| Model | Description | Max Tokens | Recommended |
|-------|-------------|------------|-------------|
| `llama-3.3-70b-versatile` | Most capable for complex tasks | 32,768 | ⭐ |
| `llama-3.3-70b-specdec` | Faster inference | 8,192 | |
| `llama-3.1-8b-instant` | Quick responses | 8,192 | |
| `mixtral-8x7b-32768` | Large context window | 32,768 | |
| `gemma2-9b-it` | Efficient for most tasks | 8,192 | |
| `qwen-2.5-32b` | Strong multilingual | 128,000 | |
| `qwen-2.5-coder-32b` | Specialized for code | 128,000 | ⭐ |
| `deepseek-r1-distill-llama-70b` | Advanced reasoning | 16,384 | |

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
GROQ_API_KEY=your_api_key_here
```

### Config File

Configuration is stored in `~/.ai-agent/config.json`:

```json
{
  "defaultModel": "llama-3.3-70b-versatile",
  "agentMode": "build",
  "preferences": {
    "autoSave": true,
    "confirmDestructive": true,
    "theme": "dark"
  }
}
```

## 📝 Example Usage

### Creating Files (Auto-Execution)

```
🔨 [build] > Create a React todo component

📁 Auto-executing file operations:
✓ Created: src/Todo.js

// The component code is automatically saved to the file!
```

### Direct File Commands

```
🔨 [build] > /create src/hello.js console.log('Hello, World!');
✓ Created: src/hello.js

🔨 [build] > /edit src/hello.js append console.log('Goodbye!');
✓ Edited: src/hello.js

🔨 [build] > /edit src/utils.js find-replace oldFunc newFunc
✓ Edited: src/utils.js
```

### Planning a Project

```
📋 [plan] > /plan Build a Node.js Express server with JWT auth

📝 Plan Created:
PLAN: Build a Node.js Express server with JWT authentication

STEPS:
1. Initialize npm project and install dependencies
2. Create server.js with Express setup
3. Implement JWT authentication middleware
4. Create protected routes
5. Add user registration and login endpoints
...
```

### Switching Models

```
🔨 [build] > /model qwen-2.5-coder-32b
Model switched to: Qwen 2.5 Coder 32B
```

## 🔑 Getting a Groq API Key

1. Visit [https://console.groq.com/keys](https://console.groq.com/keys)
2. Sign up or log in
3. Create a new API key
4. Copy and use it with the agent

## 🛠️ Development

```bash
# Run in development mode
npm start

# Project structure
AI Agent/
├── src/
│   ├── core/
│   │   ├── Agent.js         # Main orchestrator
│   │   ├── FileManager.js   # File operations
│   │   ├── Planner.js       # Task planning
│   │   └── Executor.js      # Plan execution
│   ├── llm/
│   │   └── GroqClient.js    # Groq API client
│   ├── utils/
│   │   └── config.js        # Configuration manager
│   └── index.js             # CLI entry point
├── package.json
└── README.md
```

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 🐛 Troubleshooting

### API Key Issues

If you see "No API Key Configured":
```bash
# Set environment variable
export GROQ_API_KEY="your_key"

# Or use the config command
/config apikey your_key
```

### Model Errors

If a model fails:
```
/models  # Check available models
/model llama-3.3-70b-versatile  # Switch to default
```

---

**Happy Coding!** 🤖✨

## 🆕 Advanced Productivity & Safety

This release adds major workflow upgrades:

- **Safe Mode** for destructive operations with confirmation prompts
- **Preview + Diff** before writing AI generated changes
- **Workspace Scoping** to prevent edits outside project root
- **Undo/Redo** for file operations
- **Project Prompt** support via `.ai-agent/prompt.md`
- **Session Management** (`/session save|load|list|delete`)
- **Search/Open Helpers** (`/search`, `/open`)
- **Optional Shell Runner** (`/run`) with safety policy
- **Streaming Toggle** (`/stream on|off`)
- **Config Import/Export** (`/config import|export`)

### New Commands

- `/undo` / `/redo`
- `/search <pattern>`
- `/open <path>:<line>`
- `/session save|load|list|delete <name>`
- `/prompt show|edit <text>|reset`
- `/stream on|off`
- `/preview on|off`
- `/config workspace <path>`
- `/config safemode on|off`
- `/config showdiff on|off`
- `/config export <path>` / `/config import <path>`
