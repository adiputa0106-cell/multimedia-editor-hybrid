import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  StatusBar,
  Alert,
} from 'react-native';
import { Colors, Spacing, Fonts, Radius } from '../design/tokens';
import { getAllProjects, deleteProject } from '../core/storage';
import type { Project } from '../core/types';

interface Props {
  onNewPhoto: () => void;
  onOpenProject: (project: Project) => void;
}

export default function HomeScreen({ onNewPhoto, onOpenProject }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const all = await getAllProjects();
      setProjects(all.filter((p) => p.mediaType === 'photo'));
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleDeleteProject = (project: Project) => {
    Alert.alert(
      'Hapus Proyek',
      `Hapus "${project.name}"? Edit-state akan dihapus. File media asli tetap aman.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            await deleteProject(project.projectId);
            await loadProjects();
          },
        },
      ]
    );
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.appTitle}>✦ PhotoEditor</Text>
        <Text style={styles.appSubtitle}>Local-first professional photo editor</Text>
      </View>

      {/* New Project Buttons */}
      <View style={styles.newProjectSection}>
        <Text style={styles.sectionLabel}>Mulai Mengedit</Text>
        <TouchableOpacity
          style={[styles.newProjectBtn, styles.photoBtnFull]}
          onPress={onNewPhoto}
          activeOpacity={0.8}
        >
          <Text style={styles.newProjectIcon}>🖼️</Text>
          <View style={styles.newProjectBtnContent}>
            <Text style={styles.newProjectBtnText}>Buka Editor Foto</Text>
            <Text style={styles.newProjectBtnSub}>Adjustments, filter preset, HSL mixer, teks, dan ekspor</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Recent Projects */}
      <View style={styles.recentSection}>
        <Text style={styles.sectionLabel}>Proyek Tersimpan</Text>
        {loading ? (
          <Text style={styles.emptyText}>Memuat...</Text>
        ) : projects.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📂</Text>
            <Text style={styles.emptyText}>Belum ada proyek tersimpan</Text>
            <Text style={styles.emptySubText}>
              Proyek tersimpan di penyimpanan lokal perangkat.{'\n'}
              Edit-state aman selama data aplikasi tidak dihapus.
            </Text>
          </View>
        ) : (
          <FlatList
            data={projects}
            keyExtractor={(item) => item.projectId}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.projectCard}
                onPress={() => onOpenProject(item)}
                onLongPress={() => handleDeleteProject(item)}
                activeOpacity={0.7}
              >
                <View style={styles.projectCardLeft}>
                  <View style={[
                    styles.projectTypeBadge,
                    item.mediaType === 'photo' ? styles.photoBadge : styles.videoBadge,
                  ]}>
                    <Text style={styles.projectTypeIcon}>
                      {item.mediaType === 'photo' ? '🖼️' : '🎬'}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.projectName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.projectMeta}>
                      {item.source.fileName} · {formatDate(item.updatedAt)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.projectArrow}>›</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>

      {/* Footer disclaimer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          ⚠️ Data tersimpan lokal. Menghapus data aplikasi akan menghapus proyek tersimpan.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    paddingTop: 56,
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  appTitle: {
    fontSize: Fonts.sizes['2xl'],
    fontWeight: '700',
    color: Colors.primary,
    letterSpacing: 1,
  },
  appSubtitle: {
    fontSize: Fonts.sizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  newProjectSection: {
    padding: Spacing.base,
    paddingBottom: 0,
  },
  sectionLabel: {
    fontSize: Fonts.sizes.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  newProjectRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  newProjectBtn: {
    flex: 1,
    padding: Spacing.base,
    borderRadius: Radius.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  photoBtnFull: {
    backgroundColor: Colors.bgCard,
    borderColor: Colors.primary + '88',
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    gap: Spacing.base,
  },
  newProjectBtnContent: {
    flex: 1,
  },
  newProjectIcon: {
    fontSize: 36,
  },
  newProjectBtnText: {
    fontSize: Fonts.sizes.base,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  newProjectBtnSub: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  recentSection: {
    flex: 1,
    padding: Spacing.base,
    marginTop: Spacing.lg,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: Spacing['2xl'],
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: Fonts.sizes.base,
    marginBottom: Spacing.sm,
  },
  emptySubText: {
    color: Colors.textMuted,
    fontSize: Fonts.sizes.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  projectCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: Spacing.md,
  },
  projectTypeBadge: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBadge: {
    backgroundColor: Colors.primaryGlow,
  },
  videoBadge: {
    backgroundColor: Colors.accentGlow,
  },
  projectTypeIcon: {
    fontSize: 20,
  },
  projectName: {
    fontSize: Fonts.sizes.base,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  projectMeta: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textSecondary,
  },
  projectArrow: {
    fontSize: 22,
    color: Colors.textMuted,
    marginLeft: Spacing.sm,
  },
  footer: {
    padding: Spacing.base,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  footerText: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
