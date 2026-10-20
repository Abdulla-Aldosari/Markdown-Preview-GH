# Mermaid Theme Audit

## 01 - flowchart

```mermaid
flowchart LR
    A[Start] --> B{Decision}
    B -->|Yes| C[Do it]
    B -->|No| D[Skip]
```

## 02 - sequenceDiagram

```mermaid
sequenceDiagram
    participant Alice
    participant Bob
    Alice->>Bob: Hello Bob, how are you?
    Bob-->>Alice: Great!
    Alice->>Bob: See you later!
```

## 03 - classDiagram

```mermaid
classDiagram
    class Animal {
        +String name
        +int age
        +makeSound() void
    }
    class Dog
    Animal <|-- Dog
```

## 04 - stateDiagram

```mermaid
stateDiagram-v2
    [*] --> Still
    Still --> Moving
    Moving --> Still
    Moving --> Crash
    Crash --> [*]
```

## 05 - erDiagram

```mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER {
        string name
        string email
    }
    ORDER {
        int orderNumber
    }
```

## 06 - gitGraph

```mermaid
gitGraph
title This title is just a test for all the diagrams.
   commit
   commit
   branch develop
   checkout develop
   commit
   commit
   checkout main
   merge develop
```

## 07 - pie

```mermaid
pie title Pets adopted
    "Dogs" : 386
    "Cats" : 85
    "Birds" : 15
```

## 08 - quadrantChart

```mermaid
quadrantChart
    title Reach and engagement
    x-axis Low Reach --> High Reach
    y-axis Low Engagement --> High Engagement
    quadrant-1 We should expand
    quadrant-2 Need to engage
    quadrant-3 Re-evaluate
    quadrant-4 May be improved
    Campaign A: [0.3, 0.6]
    Campaign B: [0.45, 0.23]
```

## 09 - requirementDiagram

```mermaid
requirementDiagram
    requirement test_req {
        id: 1
        text: the test text.
    }
    element test_entity {
        type: simulation
    }
    test_entity - satisfies -> test_req
```

## 10 - gantt

```mermaid
gantt
    title A Gantt Diagram
    dateFormat YYYY-MM-DD
    section Section
    A task :a1, 2024-01-01, 30d
    Another task :after a1, 20d
```

## 11 - journey

```mermaid
journey
    title My working day
    section Go to work
      Make tea: 5: Me
      Go upstairs: 3: Me
    section Go home
      Go downstairs: 5: Me
      Sit down: 4: Me
```

## 12 - mindmap

```mermaid
mindmap
  root((mindmap))
    Origins
      Long history
    Research
      On effectiveness
    Text formatting
```

## 13 - timeline

```mermaid
timeline
    title History of Social Media
    2002 : LinkedIn
    2004 : Facebook
    2006 : Twitter
```

## 14 - sankey

```mermaid
sankey
Bio-conversion,Losses,26.862
Bio-conversion,Solid,280.322
Bio-conversion,Gas,81.144
```

## 15 - xyChart

```mermaid
xychart-beta
    title "Sales"
    x-axis [jan, feb, mar]
    y-axis "Revenue" 0 --> 100
    bar [50, 60, 40]
    line [30, 40, 60]
```

## 16 - block

```mermaid
block-beta
    columns 3
    A B C
    D E F
```

## 17 - packet

```mermaid
packet-beta
title Example
0-10: "hello"
11-20: "world"
```

## 18 - kanban

```mermaid
kanban
title This title is test
  Todo
    [Create Documentation]
    [Buy Milk]
  Done
    [Buy Eggs]
```

## 19 - architecture

```mermaid
architecture-beta
    group api(logical)[API]
    service db(database)[Database] in api
    service web(server)[Web Server] in api
    db:R --> L:web
```

## 20 - venn

```mermaid
venn-beta
title This title is just a test for all the diagrams.
  set Desirable
  set Feasible
  set Viable
  union Desirable,Feasible["Buildable"]
  union Feasible,Viable["Sustainable"]
  union Desirable,Viable["Marketable"]
  union Desirable,Feasible,Viable["Ship it"]
```

vvvvvvvv

## 21 - swimlane

```mermaid
swimlane-beta
A[Service] --> B[Database]
C[Client] --> A
```

## 22 - treeView

```mermaid
treeView-beta
  src
    index.ts
    utils
      helper.ts
      format.ts
```

## 23 - c4

```mermaid
C4Context
  title System Context
  Person(customer, "Customer")
  System(system, "System")
  Rel(customer, system, "Uses")
```

vvvvvv

## 24 - ishikawa

```mermaid
ishikawa-beta
root Main Problem
cause Problem 1
cause Problem 2
```

## 25 - radar1

```mermaid
radar-beta
  title Restaurant Comparison
  axis food["Food Quality"], service["Service"], price["Price"]
  axis ambiance["Ambiance"]

  curve a["Restaurant A"]{4, 3, 2, 4}
  curve b["Restaurant B"]{3, 4, 3, 3}
  curve c["Restaurant C"]{2, 3, 4, 2}
  curve d["Restaurant D"]{2, 2, 4, 3}

  graticule polygon
  max 5
```

## 26 - radar2

```mermaid
---
config:
  radar:
    axisScaleFactor: 0.25
    curveTension: 0.1
  theme: base
  themeVariables:
    radar:
      curveOpacity: 0
---
radar-beta
title This title is just a test for all the diagrams
  axis A, B, C, D, E
  curve c1{1,2,3,4,5}
  curve c2{5,4,3,2,1}
  curve c3{3,3,3,3,3}

```

## 27 - treemap

```mermaid
treemap-beta
title This title is just a test for all the diagrams.
"Products"
    "Electronics"
        "Phones": 50
        "Computers": 30
        "Accessories": 20
    "Clothing"
        "Men's": 40
        "Women's": 40
```

## 28 - Cynefin

```mermaid
cynefin-beta
  title Incident Response

  complex
    "Investigate root cause"
    "Run chaos experiment"

  complicated
    "Analyze performance data"
    "Expert review needed"

  clear
    "Restart service"
    "Apply known fix"

  chaotic
    "Page on-call immediately"

  confusion
    "Unknown failure mode"
```

## 29 - zenuml

```mermaid
---
config:
  theme: redux-dark-color
---
zenuml
    title Reply message
    Client->A.method() {
      B.method() {
        if(condition) {
          return x1
          // return early
          @return
          A->Client: x11
        }
      }
      return x2
    }
```

## 30 - wardley

```mermaid

wardley-beta
title Forces

component Legacy [0.20, 0.85]
component Modern [0.55, 0.60]
component AI [0.70, 0.35]

Legacy -> Modern
Modern -> AI

accelerator "AI Adoption" [0.55, 0.25]
deaccelerator "Legacy Constraints" [0.15, 0.75]

```
