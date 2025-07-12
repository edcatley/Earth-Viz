# Earth.ts Documentation

This folder contains documentation and analysis diagrams for the Earth.ts application.

## Files

- `callback-flow-analysis.md` - Detailed analysis of callback patterns and data flow with PlantUML diagrams

## Viewing PlantUML Diagrams

The diagrams in this documentation use PlantUML format. Here are several ways to view them:

### 1. Online PlantUML Editor (Easiest)
1. Go to http://www.plantuml.com/plantuml/uml/
2. Copy the PlantUML code from the markdown files (everything between ```plantuml and ```)
3. Paste it into the online editor
4. The diagram will render automatically

### 2. VS Code Extension
1. Install the "PlantUML" extension by jebbs
2. Open the markdown file in VS Code
3. Use Ctrl+Shift+P (Cmd+Shift+P on Mac) and search for "PlantUML: Preview Current Diagram"
4. The diagram will open in a preview pane

### 3. Local PlantUML Installation
1. Install Java (required for PlantUML)
2. Download plantuml.jar from https://plantuml.com/download
3. Save the PlantUML code to a .puml file
4. Run: `java -jar plantuml.jar yourfile.puml`
5. This generates PNG/SVG files

### 4. JetBrains IDEs (IntelliJ, WebStorm, etc.)
1. Install the PlantUML integration plugin
2. Open the markdown file
3. The diagrams should render inline or you can right-click to preview

### 5. GitHub/GitLab
Some Git platforms support PlantUML rendering directly in markdown files.

## Diagram Contents

The callback flow analysis includes:

1. **Sequence Diagram** - Shows the complete flow from user input to render
2. **Component Diagram** - Shows system architecture and relationships  
3. **Activity Diagram** - Highlights redundancies in the current callback system
4. **Proposed Flow** - Simplified architecture suggestion

## Key Findings

The analysis identified several areas for improvement:
- 5 unused events that are emitted but never consumed
- Multiple events triggering the same render function
- Inconsistent observer patterns across systems
- Opportunities for consolidation and simplification 