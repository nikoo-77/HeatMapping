#  Cebu Employee Distribution & Crisis Map

An interactive, responsive, and full-featured crisis response and employee safety coordination dashboard. Designed specifically for coordinating corporate business continuity planning (BCP) in **Cebu Island** and **Metro Cebu**, this platform acts as a mission-critical tool during localized emergencies, natural disasters, or network downtime.

---

##  Design Concept & Visual Identity

The interface utilizes a polished **Cosmic Slate Theme** with clean dark cards, high-contrast typography, and beautiful layout alignments that reduce eye strain during prolonged monitoring sessions:
- **Typography Pairing**: Elegant display headers paired with clean **Inter** sans-serif typography for maximum readability, alongside a **JetBrains Mono** font family for system logs, coordinates, and latency indicators.
- **Responsive Layout**: Designed with fluid grid adjustments, prioritizing space density on wide desktop layouts while retaining comfortable, interactive touch targets on mobile viewports.

---

##  Key Features

###  Interactive Heat Map View
- **Dual Perspective Mapping**: Instantly toggle between a comprehensive **Cebu Island View** and a detailed **Metro Cebu View** focusing on metropolitan hubs (IT Park, Lahug, Cebu Business Park).
- **Accurate Geolocation Rendering**: Renders real-time GPS coords and spatial clusters for personnel residing across municipalities.
- **Map Focus**: Focus on individual personnel or specific clusters with responsive layout shifts.

###  Real-Time Incident Simulator (Crisis Drills)
- **Simulated Disasters**: Easily inject mock emergency drills on the Cebu grid:
  -  **Labangon Outbreak Fire**: Localized urban residential hazard.
  -  **M6.8 Undersea Earthquake**: Regional seismic disruption affecting telecom masts.
  -  **Super Typhoon "Odette II"**: High-wind coastal flooding disrupting lowlands.
  -  **Random Gas Leak**: Localized coordinate-bound threat vectors.
- **Dynamic Threat Radius Slider**: Adjust the safety buffer radius from `4` to `35` units (translates to dynamic kilometer ranges) with responsive calculations identifying personnel currently residing inside the threat perimeter.

###  Manual Outreach Roll-Call Protocol
- **Bandwidth & Grid Conservation Mandate**: In accordance with local BCP directives, automated bulk broadcasting has been replaced with a secure **Manual Contact Protocol** to optimize telecom signal capacity during crises.
- **Direct Interactive Badges**: Rapidly trigger individual outreach protocols:
  -  **Phone Action**: One-click direct dial simulation (`tel:` link with Philippines custom carrier formatting).
  -  **Email Action**: Immediate pre-composed template links (`mailto:`) for official employee records.
  -  **Manual SMS Trigger**: Trigger simulated GSM/SMS check-ins which track exact response timestamps (`lastMessageSent`).

###  Personnel Status Tracker & Carrier Insights
- **Active GSM Link Monitor**: Tracks active cellular carrier subscriptions (**Smart**, **Globe**, and **DITO**) for each employee.
- **Failed Link Simulations**: Automatically marks DITO GSM carrier lines as offline/failed during crises to simulate tower downtime, prompting immediate alternative rescue dispatching.
- **Live Communication Logs**: Keeps an immutable, scrollable run-time terminal log detailing manual contacts, BCP updates, and check-in success states.

---

## 🛠️ Technology Stack

- **Framework**: [React 19](https://react.dev/) with [Vite](https://vite.dev/) for high-speed module loading and bundling.
- **Language**: [TypeScript](https://www.typescriptlang.org/) for robust, compile-time type-safety.
- **Styles**: [Tailwind CSS 4.x](https://tailwindcss.com/) utilizing native CSS imports (`@import "tailwindcss"`) and customized color palettes.
- **Icons**: [Lucide React](https://lucide.dev/) for clean, visually descriptive iconography.
- **Mapping & Interaction**: Leaflet mapping integrations with custom state synchronization.

---

##  Project Directory Structure

``
├── .env.example            # Sample configuration for environment variables
├── package.json            # Scripts, dependency manifests, and settings
├── tsconfig.json           # Type-checking rules and paths
├── vite.config.ts          # Vite build pipeline and plugin configurations
├── metadata.json           # Application properties and frame permission configurations
├── src/
│   ├── main.tsx            # Main application bootstrap entry-point
│   ├── App.tsx             # Primary layout and state orchestration hub
│   ├── index.css           # Global Tailwind and custom font configurations
│   ├── types.ts            # Shared TypeScript interfaces and enums
│   ├── data.ts             # Default configuration and signal tower details
│   ├── data_cebu.ts        # Procedural database seeding and coordinates generator
│   └── components/
│       ├── InteractiveMap.tsx     # Spatial Leaflet map component with cluster plots
│       ├── EmployeeRollCall.tsx   # Manual contact panel, status filters, and actions
│       └── StatusTracker.tsx      # Active drills manager, carrier list, and console logs
```

---

## ⚙️ Development & Installation

Ensure you have [Node.js](https://nodejs.org/) installed, then follow the instructions below:

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Local Development Server
Starts the development web server on port `3000`:
```bash
npm run dev
```

### 3. Build for Production
Creates an optimized production bundle inside the `dist/` directory:
```bash
npm run build
```

### 4. Code Quality & Formatting
Run the linter to verify TypeScript types and syntax validity:
```bash
npm run lint
```
