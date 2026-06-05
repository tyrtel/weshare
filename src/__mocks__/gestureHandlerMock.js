'use strict';

const React = require('react');
const { View } = require('react-native');

// Stub GestureDetector as a plain View pass-through.
function GestureDetector({ children }) {
  return children;
}

// Stub Gesture builder — returns a chainable object for all gesture types.
function gestureStub() {
  const g = {
    activeOffsetY:  () => g,
    activeOffsetX:  () => g,
    onBegin:        () => g,
    onUpdate:       () => g,
    onEnd:          () => g,
    onFinalize:     () => g,
    onStart:        () => g,
    simultaneousWithExternalGesture: () => g,
    requireExternalGestureToFail:    () => g,
    enabled:        () => g,
    minPointers:    () => g,
    maxPointers:    () => g,
  };
  return g;
}

const Gesture = {
  Pan:       gestureStub,
  Tap:       gestureStub,
  LongPress: gestureStub,
  Pinch:     gestureStub,
  Rotation:  gestureStub,
  Fling:     gestureStub,
  Simultaneous: (...gs) => gs[0],
  Race:         (...gs) => gs[0],
  Exclusive:    (...gs) => gs[0],
};

// GestureHandlerRootView — plain View wrapper.
function GestureHandlerRootView({ children, style }) {
  return React.createElement(View, { style }, children);
}

module.exports = {
  GestureDetector,
  GestureHandlerRootView,
  Gesture,
  State: {},
  Directions: {},
};
