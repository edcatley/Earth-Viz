# Mouse Drag Flow - Block Diagram

## Current Problem Flow

```plantuml
@startuml Current Problem
!theme plain
skinparam backgroundColor white

rectangle "Mouse Drag" as drag
rectangle "Globe Projection\nUpdates (IMMEDIATE)" as globe
rectangle "emit('globeChanged')" as globeEvent

rectangle "PARALLEL BRANCHES" as parallel {
  rectangle "Mask Update\n(FAST)" as mask {
    rectangle "createMask()" as createMask
    rectangle "emit('maskChanged')" as maskEvent
  }
  
  rectangle "Overlay Regen\n(SLOW)" as overlay {
    rectangle "Uses OLD mask!" as oldMask1 #FFaaaa
    rectangle "generateOverlay()" as genOverlay
    rectangle "emit('overlayChanged')" as overlayEvent
    rectangle "performRender()" as render1
  }
  
  rectangle "Planet Regen\n(SLOW)" as planet {
    rectangle "Uses OLD mask!" as oldMask2 #FFaaaa
    rectangle "generatePlanet()" as genPlanet
    rectangle "emit('planetChanged')" as planetEvent
    rectangle "performRender()" as render2
  }
}

rectangle "RESULT:\nSVG uses new projection\nOverlays use old mask\n= MISMATCH" as result #FFaaaa

drag --> globe
globe --> globeEvent
globeEvent --> parallel

createMask --> maskEvent
oldMask1 --> genOverlay
genOverlay --> overlayEvent
overlayEvent --> render1

oldMask2 --> genPlanet
genPlanet --> planetEvent
planetEvent --> render2

parallel --> result

@enduml
```

## Fixed Flow

```plantuml
@startuml Fixed Flow
!theme plain
skinparam backgroundColor white

rectangle "Mouse Drag" as drag
rectangle "Globe Projection\nUpdates (IMMEDIATE)" as globe
rectangle "emit('globeChanged')" as globeEvent
rectangle "Mask Update" as maskUpdate
rectangle "createMask() with\nNEW projection" as createMask
rectangle "emit('maskChanged')" as maskEvent

rectangle "PARALLEL BRANCHES" as parallel {
  rectangle "Particle Regen" as particle {
    rectangle "Uses NEW mask ✓" as newMask1 #aaffaa
    rectangle "regenerate\nparticles" as genParticle
  }
  
  rectangle "Overlay Regen" as overlay {
    rectangle "Uses NEW mask ✓" as newMask2 #aaffaa
    rectangle "generateOverlay()" as genOverlay
    rectangle "emit('overlayChanged')" as overlayEvent
    rectangle "performRender()" as render1
  }
  
  rectangle "Planet Regen" as planet {
    rectangle "Uses NEW mask ✓" as newMask3 #aaffaa
    rectangle "generatePlanet()" as genPlanet
    rectangle "emit('planetChanged')" as planetEvent
    rectangle "performRender()" as render2
  }
}

rectangle "RESULT:\nEverything uses same\nNEW projection + NEW mask\n= CONSISTENT" as result #aaffaa

drag --> globe
globe --> globeEvent
globeEvent --> maskUpdate
maskUpdate --> createMask
createMask --> maskEvent
maskEvent --> parallel

newMask1 --> genParticle
newMask2 --> genOverlay
genOverlay --> overlayEvent
overlayEvent --> render1

newMask3 --> genPlanet
genPlanet --> planetEvent
planetEvent --> render2

parallel --> result

@enduml
```

## The Fix

**Before:**
- OverlaySystem listens to `globeChanged` (uses old mask)
- PlanetSystem listens to `globeChanged` (uses old mask)

**After:**
- OverlaySystem listens to `maskChanged` (uses new mask)
- PlanetSystem listens to `maskChanged` (uses new mask) 