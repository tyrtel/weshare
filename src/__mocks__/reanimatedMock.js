'use strict';

const React = require('react');
const { View, Text, Image, ScrollView } = require('react-native');

// Chainable builder stub — returned by all entering/exiting/layout factory functions.
function animationStub() {
  const builder = {
    delay: () => builder,
    duration: () => builder,
    springify: () => builder,
    damping: () => builder,
    stiffness: () => builder,
    mass: () => builder,
    withInitialValues: () => builder,
    build: () => undefined,
  };
  return builder;
}

// Animated namespace — mirrors RN Animated so existing component tests keep working.
const Animated = {
  View,
  Text,
  Image,
  ScrollView,
  createAnimatedComponent: (Component) => Component,
};

// Hooks
const useSharedValue = (init) => ({ value: init });
const useAnimatedStyle = (fn) => { try { return fn(); } catch { return {}; } };
const useAnimatedProps = (fn) => { try { return fn(); } catch { return {}; } };
const useAnimatedRef = () => ({ current: null });
const useDerivedValue = (fn) => ({ value: fn() });
const useAnimatedScrollHandler = () => () => {};
const useAnimatedGestureHandler = () => () => {};

// Animation functions
const withSpring = (value) => value;
const withTiming = (value) => value;
const withDelay = (_delay, anim) => anim;
const withSequence = (...anims) => anims[anims.length - 1];
const withRepeat = (anim) => anim;
const cancelAnimation = () => {};
const runOnJS = (fn) => fn;
const runOnUI = (fn) => fn;

// Entering / Exiting / Layout animation factories
const FadeIn       = animationStub();
const FadeInDown   = animationStub();
const FadeInUp     = animationStub();
const FadeInLeft   = animationStub();
const FadeInRight  = animationStub();
const FadeOut      = animationStub();
const FadeOutDown  = animationStub();
const FadeOutUp    = animationStub();
const SlideInDown  = animationStub();
const SlideInUp    = animationStub();
const SlideInLeft  = animationStub();
const SlideInRight = animationStub();
const SlideOutDown = animationStub();
const SlideOutUp   = animationStub();
const ZoomIn       = animationStub();
const ZoomOut      = animationStub();
const BounceIn     = animationStub();
const FlipInEasyX  = animationStub();
const LinearTransition = animationStub();
const Layout       = animationStub();

// Enums / constants
const Easing = { linear: (t) => t, ease: (t) => t, quad: (t) => t, out: (fn) => fn, in: (fn) => fn, inOut: (fn) => fn, bezier: () => (t) => t };
const Extrapolation = { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' };
const ReduceMotion = { System: 'system', Always: 'always', Never: 'never' };

const interpolate = (value, inputRange, outputRange) => {
  const index = inputRange.findIndex((v) => value <= v);
  if (index === 0) return outputRange[0];
  if (index === -1) return outputRange[outputRange.length - 1];
  const ratio = (value - inputRange[index - 1]) / (inputRange[index] - inputRange[index - 1]);
  return outputRange[index - 1] + ratio * (outputRange[index] - outputRange[index - 1]);
};

module.exports = {
  default: Animated,
  ...Animated,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  useAnimatedRef,
  useDerivedValue,
  useAnimatedScrollHandler,
  useAnimatedGestureHandler,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  withRepeat,
  cancelAnimation,
  runOnJS,
  runOnUI,
  FadeIn, FadeInDown, FadeInUp, FadeInLeft, FadeInRight,
  FadeOut, FadeOutDown, FadeOutUp,
  SlideInDown, SlideInUp, SlideInLeft, SlideInRight,
  SlideOutDown, SlideOutUp,
  ZoomIn, ZoomOut,
  BounceIn,
  FlipInEasyX,
  LinearTransition,
  Layout,
  Easing,
  Extrapolation,
  ReduceMotion,
  interpolate,
};
