import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { DBPdf, deleteUserPdf, getUserPdfs } from '../database/database';
import { useAuth } from '../hooks/AuthContext';

export default function ExplorePage() {
  const { user } = useAuth();
  const [resources, setResources] = useState<DBPdf[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedPdf, setSelectedPdf] = useState<DBPdf | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      setLoading(true);
      getUserPdfs(user.id)
        .then(setResources)
        .finally(() => setLoading(false));
    }, [user]),
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return resources;
    const q = search.toLowerCase();
    return resources.filter((r) => r.file_name.toLowerCase().includes(q));
  }, [resources, search]);

  const handleDelete = (itemId: number, fileName: string) => {
    Alert.alert('Remove PDF', `Remove "${fileName}" from your vault?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteUserPdf(itemId);
            setResources((prev) => prev.filter((p) => p.id !== itemId));
          } catch {
            Alert.alert('Error', 'Could not delete the file.');
          }
        },
      },
    ]);
  };

  const renderRightActions = (progress: any, dragX: any, item: DBPdf) => {
  return (
    <TouchableOpacity
      onPress={() => handleDelete(item.id, item.file_name)}
      style={styles.swipeDelete}
    >
      <Ionicons name="trash" size={22} color="#fff" />
    </TouchableOpacity>
  );
};

  return (
    <View style={styles.container}>

      <Text style={styles.title}>📚 Your Vault</Text>

      {/* SEARCH */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color="#888" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search your files…"
          placeholderTextColor="#aaa"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color="#bbb" />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.subtitle}>
        {resources.length === 0
          ? 'Nothing here yet'
          : `${filtered.length} of ${resources.length}`}
      </Text>

      {loading ? (
        <View style={styles.loadingWrapper}>
          <ActivityIndicator size="large" color="#7C5CBF" />
          <Text style={styles.loadingText}>Loading your vault…</Text>
        </View>
      ) : resources.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="library-outline" size={80} color="#DDD" />
          <Text style={styles.emptyTitle}>Your vault is empty</Text>
          <Text style={styles.emptySubtitle}>Upload PDFs from AI Tutor</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="search-outline" size={60} color="#DDD" />
          <Text style={styles.emptyTitle}>No results found</Text>
        </View>
      ) : (
        <FlatList
  data={filtered}
  keyExtractor={(item) => String(item.id)}
  showsVerticalScrollIndicator={false}
  contentContainerStyle={{ paddingBottom: 30 }}
  renderItem={({ item }) => (
    <Swipeable 
      renderRightActions={(progress, dragX) => 
        renderRightActions(progress, dragX, item)
      }
    >
      <TouchableOpacity 
        onPress={() => setSelectedPdf(item)} 
        activeOpacity={0.85}
      >
        <View style={styles.card}>
          <View style={styles.iconBox}>
            <Ionicons name="document-text" size={20} color="#fff" />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.fileName} numberOfLines={1}>
              {item.file_name}
            </Text>
            <Text style={styles.uploadDate}>
              {new Date(item.uploaded_at).toDateString()}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </Swipeable>
  )}
/>
      )}
    </View>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#F3F0FF',
  },

  swipeDelete: {
  backgroundColor: '#FF4D4F',
  justifyContent: 'center',
  alignItems: 'center',
  width: 80,
  borderRadius: 20,
  marginBottom: 10,
},

  title: {
    fontSize: 26,
    fontWeight: '900',
    color: '#1C1340',
    marginTop: 50,
    marginBottom: 14,
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,

    shadowColor: '#7C5CBF',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },

  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    marginLeft: 6,
  },

  subtitle: {
    fontSize: 12,
    color: '#888',
    marginBottom: 14,
  },

  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  emptyTitle: {
    color: '#999',
    marginTop: 14,
    fontSize: 16,
    fontWeight: '600',
  },

  emptySubtitle: {
    color: '#bbb',
    marginTop: 5,
    fontSize: 13,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 14,
    marginBottom: 10,

    shadowColor: '#7C5CBF',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },

  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#7C5CBF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  cardInfo: {
    flex: 1,
  },

  fileName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1340',
  },

  uploadDate: {
    fontSize: 11,
    color: '#888',
    marginTop: 3,
  },

  deleteBtn: {
    padding: 6,
  },

  loadingWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },

  loadingText: {
    color: '#888',
    fontSize: 13,
  },
});