// Reference dimensions are meters. Speeds/forces are game-scale tuning, not flight dynamics.
const AircraftModels = Object.freeze({
  B738: Object.freeze({ id: 'B738', name: 'Boeing 737-800', length: 39.5, span: 35.8, fuselage: 3.76, engines: 2, winglets: true, wake: 'M', gate: 'C', minRunway: 1800, cruise: 1.35, taxi: .48, rotation: 1.65, takeoffRun: .57, brake: .07, color: '#e3ab53' }),
  B788: Object.freeze({ id: 'B788', name: 'Boeing 787-8', length: 56.7, span: 60.1, fuselage: 5.77, engines: 2, raked: true, wake: 'H', gate: 'E', minRunway: 2400, cruise: 1.45, taxi: .42, rotation: 1.8, takeoffRun: .65, brake: .06, color: '#56a9ce' }),
  A388: Object.freeze({ id: 'A388', name: 'Airbus A380-800', length: 72.7, span: 79.75, fuselage: 7.14, engines: 4, doubleDeck: true, wake: 'J', gate: 'F', minRunway: 2800, cruise: 1.4, taxi: .34, rotation: 1.9, takeoffRun: .73, brake: .05, color: '#ae9bd9' }),
  H145: Object.freeze({ id: 'H145', name: 'Airbus H145', length: 13.0, span: 11.0, fuselage: 2.0, engines: 0, helicopter: true, wake: 'L', gate: 'H', minRunway: 0, cruise: .8, taxi: .2, rotation: .2, takeoffRun: .1, brake: .08, color: '#e5d36b' })
});
globalThis.AircraftModels = AircraftModels;
