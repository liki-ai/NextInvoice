import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet, View } from 'react-native';
import InvoiceListScreen from '../screens/InvoiceListScreen';
import InvoiceDetailScreen from '../screens/InvoiceDetailScreen';
import NewInvoiceScreen from '../screens/NewInvoiceScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { useTranslation } from '../i18n/I18nContext';
import { colors } from '../theme';

const Tab = createBottomTabNavigator();
const InvoicesStack = createNativeStackNavigator();

function InvoicesStackNavigator() {
  const { t } = useTranslation();
  return (
    <InvoicesStack.Navigator>
      <InvoicesStack.Screen
        name="InvoicesList"
        component={InvoiceListScreen}
        options={{ title: t('invoiceList.title') }}
      />
      <InvoicesStack.Screen
        name="InvoiceDetail"
        component={InvoiceDetailScreen}
        options={{ title: t('invoiceDetail.title') }}
      />
    </InvoicesStack.Navigator>
  );
}

function PlusTabIcon({ focused }) {
  return (
    <View style={[styles.plusWrap, focused && styles.plusWrapActive]}>
      <View style={[styles.plusButton, focused ? styles.plusButtonActive : styles.plusButtonInactive]}>
        <Ionicons name="add" size={34} color={focused ? '#fff' : colors.primary} />
      </View>
    </View>
  );
}

export default function RootNavigator() {
  const { t } = useTranslation();

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: styles.tabBar,
          tabBarItemStyle: styles.tabBarItem,
          tabBarLabelStyle: styles.tabBarLabel,
          tabBarIcon: ({ color, focused }) => {
            if (route.name === 'Invoices') {
              return (
                <View style={[styles.sideIcon, focused && styles.sideIconActive]}>
                  <Ionicons name={focused ? 'document-text' : 'document-text-outline'} size={24} color={color} />
                </View>
              );
            }
            if (route.name === 'NewInvoice') {
              return <PlusTabIcon focused={focused} />;
            }
            if (route.name === 'Profile') {
              return (
                <View style={[styles.sideIcon, focused && styles.sideIconActive]}>
                  <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={color} />
                </View>
              );
            }
            return null;
          },
        })}
      >
        <Tab.Screen
          name="Invoices"
          component={InvoicesStackNavigator}
          options={{ title: t('tabs.invoices'), tabBarLabel: t('tabs.invoices') }}
        />
        <Tab.Screen
          name="NewInvoice"
          component={NewInvoiceScreen}
          options={{ title: t('tabs.newInvoice'), tabBarLabel: () => null }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{ title: t('tabs.profile'), tabBarLabel: t('tabs.profile') }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: Platform.OS === 'ios' ? 88 : 72,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    backgroundColor: colors.surface,
    borderTopWidth: 0,
    elevation: 12,
    shadowColor: '#1D2B2E',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  tabBarItem: {
    paddingTop: 2,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  sideIcon: {
    width: 40,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideIconActive: {
    transform: [{ scale: 1.05 }],
  },
  plusWrap: {
    position: 'absolute',
    top: -22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusWrapActive: {
    top: -26,
  },
  plusButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.surface,
  },
  plusButtonActive: {
    backgroundColor: colors.primary,
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
  plusButtonInactive: {
    backgroundColor: '#EEF5F7',
    borderColor: colors.surface,
    shadowColor: '#1D2B2E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
});
