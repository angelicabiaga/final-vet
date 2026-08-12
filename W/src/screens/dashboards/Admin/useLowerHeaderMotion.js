import React from 'react';
import { Animated, Easing } from 'react-native';

export const useLowerHeaderMotion = () => {
  const scrollViewRef = React.useRef(null);
  const lowerHeaderAnimation = React.useRef(new Animated.Value(1)).current;
  const isLowerHeaderVisible = React.useRef(true);
  const lastScrollY = React.useRef(0);

  const animateLowerHeader = (toValue) => {
    const shouldBeVisible = toValue === 1;
    if (isLowerHeaderVisible.current === shouldBeVisible) {
      return;
    }

    isLowerHeaderVisible.current = shouldBeVisible;
    lowerHeaderAnimation.stopAnimation();
    Animated.timing(lowerHeaderAnimation, {
      toValue,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  const handleScroll = (event) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    const deltaY = Math.abs(currentScrollY - lastScrollY.current);
    const isScrollingDown = currentScrollY > lastScrollY.current;

    if (deltaY < 4) {
      return;
    }

    if (isScrollingDown && currentScrollY > 24) {
      animateLowerHeader(0);
    } else if (!isScrollingDown || currentScrollY <= 12) {
      animateLowerHeader(1);
    }

    lastScrollY.current = currentScrollY;
  };

  return {
    scrollViewRef,
    handleScroll,
    lowerHeaderAnimatedStyle: {
      maxHeight: lowerHeaderAnimation.interpolate({ inputRange: [0, 1], outputRange: [0, 96] }),
      opacity: lowerHeaderAnimation,
      transform: [
        {
          translateY: lowerHeaderAnimation.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }),
        },
      ],
    },
  };
};