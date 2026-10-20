# Mermaid Theme Audit

## flowchart

```mermaid
flowchart LR
    A[Start] --> B{Decision}
    B -->|Yes| C[Do it]
    B -->|No| D[Skip]
```

## sequenceDiagram

```mermaid
sequenceDiagram
    participant Alice
    participant Bob
    Alice->>Bob: Hello Bob, how are you?
    Bob-->>Alice: Great!
    Alice->>Bob: See you later!
```

## classDiagram

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

## stateDiagram

```mermaid
stateDiagram-v2
    [*] --> Still
    Still --> Moving
    Moving --> Still
    Moving --> Crash
    Crash --> [*]
```

## erDiagram

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

## gitGraph

```mermaid
gitGraph
   commit
   commit
   branch develop
   checkout develop
   commit
   commit
   checkout main
   merge develop
```

## pie

```mermaid
pie title Pets adopted
    "Dogs" : 386
    "Cats" : 85
    "Birds" : 15
```

## quadrantChart

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

## requirementDiagram

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

## gantt

```mermaid
gantt
    title A Gantt Diagram
    dateFormat YYYY-MM-DD
    section Section
    A task :a1, 2024-01-01, 30d
    Another task :after a1, 20d
```

## journey

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

## mindmap

```mermaid
mindmap
  root((mindmap))
    Origins
      Long history
    Research
      On effectiveness
    Text formatting
```

## timeline

```mermaid
timeline
    title History of Social Media
    2002 : LinkedIn
    2004 : Facebook
    2006 : Twitter
```

## sankey

```mermaid
sankey-beta
  A, B : 30
  A, C : 70
```

## xyChart

```mermaid
xychart-beta
    title "Sales"
    x-axis [jan, feb, mar]
    y-axis "Revenue" 0 --> 100
    bar [50, 60, 40]
    line [30, 40, 60]
```

## block

```mermaid
block-beta
    columns 3
    A B C
    D E F
```

## packet

```mermaid
packet-beta
title Example
0-10: "hello"
11-20: "world"
```

## kanban

```mermaid
kanban
  Todo
    [Create Documentation]
    [Buy Milk]
  Done
    [Buy Eggs]
```

## architecture

```mermaid
architecture-beta
    group api(logical)[API]
    service db(database)[Database] in api
    service web(server)[Web Server] in api
    db:R --> L:web
```

## radar

```mermaid
radar-beta
  axis Sensitivity, Performance, Cost
  curve A[80, 90, 60]
  curve B[50, 40, 90]
```

## treemap

```mermaid
treemap-beta
  Market
    TSLA 100
    AAPL 500
```

## venn

```mermaid
venn-beta
  set Desirable
  set Feasible
  set Viable
  union Desirable,Feasible["Buildable"]
  union Feasible,Viable["Sustainable"]
  union Desirable,Viable["Marketable"]
  union Desirable,Feasible,Viable["Ship it"]
```

## swimlane

```mermaid
swimlane-beta
A[Service] --> B[Database]
C[Client] --> A
```

## treeView

```mermaid
treeView-beta
  src
    index.ts
    utils
      helper.ts
      format.ts
```

## c4

```mermaid
C4Context
  title System Context
  Person(customer, "Customer")
  System(system, "System")
  Rel(customer, system, "Uses")
```

## zenuml

```mermaid
zenuml
  A->B: request
  B->A: response
```

## ishikawa

```mermaid
ishikawa-beta
root Main Problem
cause Problem 1
cause Problem 2
```

## cynefin

```mermaid
cynefin-beta
title Example
n-1[Complex]
n-2[Complicated]
```

## wardley

```mermaid
wardley
anchor Customer[0.9, 0.1]
component A[0.5, 0.5]
```

## eventmodeling

```mermaid
eventmodeling
Customer -> Website[1]
```
