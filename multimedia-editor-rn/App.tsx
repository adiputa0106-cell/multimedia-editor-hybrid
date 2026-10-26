import React, { useState } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import HomeScreen from './src/screens/HomeScreen';
import PhotoEditorScreen from './src/screens/PhotoEditorScreen';
import { Colors } from './src/design/tokens';
import type { Project } from './src/core/types';

type Screen = 'home' | 'photo';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [activeProject, setActiveProject] = useState<Project | undefined>();

  const handleOpenProject = (project: Project) => {
    setActiveProject(project);
    setScreen('photo');
  };

  const handleBack = () => {
    setActiveProject(undefined);
    setScreen('home');
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      {screen === 'home' && (
        <HomeScreen
          onNewPhoto={() => { setActiveProject(undefined); setScreen('photo'); }}
          onOpenProject={handleOpenProject}
        />
      )}
      {screen === 'photo' && (
        <PhotoEditorScreen
          initialProject={activeProject}
          onBack={handleBack}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
});
