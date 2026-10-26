import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  TouchableOpacity,
  Platform,
  type LayoutChangeEvent,
} from 'react-native';
import { Colors, Fonts, Radius } from './tokens';

interface Props {
  label: string;
  value: number; // -100 s/d 100
  onChange: (val: number) => void;
  onCommit?: (val: number) => void;
  accentColor?: string;
  icon?: string;
}

export const LightroomSliderRN: React.FC<Props> = ({
  label,
  value,
  onChange,
  onCommit,
  accentColor = Colors.primary,
  icon,
}) => {
  const min = -100;
  const max = 100;

  // Always keep refs to latest props to prevent any stale closure in PanResponder
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const widthRef = useRef<number>(200);
  const initialValRef = useRef<number>(value);

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 10) {
      widthRef.current = w;
    }
  };

  const calculateValueFromLocalX = (localX: number) => {
    const w = Math.max(1, widthRef.current);
    const clampedX = Math.max(0, Math.min(w, localX));
    const ratio = clampedX / w; // 0.0 s/d 1.0
    return Math.round(min + ratio * (max - min));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 3,
      onMoveShouldSetPanResponderCapture: (_, gestureState) => Math.abs(gestureState.dx) > 3,
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: (evt, gestureState) => {
        initialValRef.current = valueRef.current;
        const localX = evt.nativeEvent.locationX;
        if (typeof localX === 'number' && widthRef.current > 10) {
          const tapVal = calculateValueFromLocalX(localX);
          valueRef.current = tapVal;
          onChangeRef.current(tapVal);
        }
      },

      onPanResponderMove: (_, gestureState) => {
        if (widthRef.current <= 10) return;
        const deltaVal = Math.round((gestureState.dx / widthRef.current) * (max - min));
        const nextVal = Math.max(min, Math.min(max, initialValRef.current + deltaVal));
        valueRef.current = nextVal;
        onChangeRef.current(nextVal);
      },

      onPanResponderRelease: () => {
        onCommitRef.current?.(valueRef.current);
      },

      onPanResponderTerminate: () => {
        onCommitRef.current?.(valueRef.current);
      },
    })
  ).current;

  const handleQuickStep = (stepVal: number) => {
    const target = Math.max(min, Math.min(max, stepVal));
    valueRef.current = target;
    onChange(target);
    onCommit?.(target);
  };

  const handleNudge = (delta: number) => {
    const target = Math.max(min, Math.min(max, value + delta));
    valueRef.current = target;
    onChange(target);
    onCommit?.(target);
  };

  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const zeroPct = 50;
  const isZero = value === 0;

  return (
    <View style={styles.container}>
      {/* Header bar: Icon + Label + Value badge */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          {icon ? <Text style={styles.icon}>{icon}</Text> : null}
          <Text style={styles.label}>{label}</Text>
        </View>
        <TouchableOpacity
          onPress={() => handleQuickStep(0)}
          style={[styles.badge, !isZero && { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: accentColor }]}
          activeOpacity={0.7}
        >
          <Text style={[styles.valueText, !isZero && { color: accentColor }]}>
            {value > 0 ? `+${value}` : value}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Slider Track Area */}
      <View
        style={styles.touchArea}
        onLayout={handleLayout}
        {...panResponder.panHandlers}
      >
        <View style={styles.track}>
          {/* Center Zero Notch */}
          <View style={styles.centerNotch} />

          {/* Active Fill from center 0 to current thumb position */}
          <View
            style={[
              styles.activeFill,
              {
                backgroundColor: accentColor,
                left: `${Math.min(pct, zeroPct)}%`,
                width: `${Math.abs(pct - zeroPct)}%`,
              },
            ]}
          />

          {/* Draggable Thumb Knob */}
          <View
            style={[
              styles.thumb,
              {
                left: `${pct}%`,
                borderColor: isZero ? Colors.textMuted : accentColor,
              },
            ]}
          />
        </View>
      </View>

      {/* Quick Step Buttons Bar for guaranteed ease of use */}
      <View style={styles.quickStepsRow}>
        <TouchableOpacity
          style={styles.nudgeBtn}
          onPress={() => handleNudge(-10)}
          activeOpacity={0.7}
        >
          <Text style={styles.nudgeBtnText}>-10</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.stepBtn, value === -50 && styles.stepBtnActive]}
          onPress={() => handleQuickStep(-50)}
          activeOpacity={0.7}
        >
          <Text style={[styles.stepBtnText, value === -50 && { color: accentColor }]}>-50</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.stepBtn, isZero && styles.stepBtnActive]}
          onPress={() => handleQuickStep(0)}
          activeOpacity={0.7}
        >
          <Text style={[styles.stepBtnText, isZero && { color: accentColor, fontWeight: '700' }]}>0</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.stepBtn, value === 50 && styles.stepBtnActive]}
          onPress={() => handleQuickStep(50)}
          activeOpacity={0.7}
        >
          <Text style={[styles.stepBtnText, value === 50 && { color: accentColor }]}>+50</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.nudgeBtn}
          onPress={() => handleNudge(10)}
          activeOpacity={0.7}
        >
          <Text style={styles.nudgeBtnText}>+10</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    backgroundColor: Colors.bgCard,
    padding: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    fontSize: 16,
  },
  label: {
    fontSize: Fonts.sizes.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 48,
    alignItems: 'center',
  },
  valueText: {
    fontSize: Fonts.sizes.xs,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '700',
    color: Colors.textMuted,
  },
  touchArea: {
    height: 40,
    justifyContent: 'center',
  },
  track: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 3,
    position: 'relative',
  },
  centerNotch: {
    position: 'absolute',
    left: '50%',
    width: 2,
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.5)',
    top: -3,
    marginLeft: -1,
  },
  activeFill: {
    position: 'absolute',
    height: '100%',
    borderRadius: 3,
  },
  thumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.white,
    borderWidth: 3,
    top: -8,
    marginLeft: -11,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
  },
  quickStepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  stepBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: 'transparent',
    minWidth: 42,
    alignItems: 'center',
  },
  stepBtnActive: {
    borderColor: Colors.border,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  stepBtnText: {
    fontSize: Fonts.sizes.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  nudgeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
  },
  nudgeBtnText: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textMuted,
    fontWeight: '600',
  },
});
