# VaaliRaivo

Vaaliraivo is a tool for following election results and insights in real time. Intended use case is to have it as a dashboard in a large screen, as a background of an election result watch party.

For each election, there should be list of separate sources to use.
Focus should especially be on real time sources. Streams. Immediate news sources. And official data. (Other ideas?)

Shared part between the different elections should a library of components.

## Elections

Election workspaces live under `elections/<year>-<country>-<election>`.

- [2026 Russian State Duma election](elections/2026-russia-state-duma/README.md) — source research complete; dashboard not started

## Process of starting to follow an election

### 1. Create folder structure for the election

### 2. Do research on possible sources

#### 2.1. Make a list of possible sources in sources.md

#### 2.2. For each source, estimate the value of data it provides. Value of source can be both either informative or 'fun'. Also, latency (how close to real time data is) is value.

#### 2.3. For each source, estimate the ability for hooking it into the dashboard

### 3. Using the components of VaaliRaivo, build a dashboard
