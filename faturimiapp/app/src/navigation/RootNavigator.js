import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet, View } from 'react-native';
import InvoiceListScreen from '../screens/InvoiceListScreen';
import InvoiceDetailScreen from '../screens/InvoiceDetailScreen';
import NewInvoiceScreen from '../screens/NewInvoiceScreen';
import ObligationListScreen from '../screens/ObligationListScreen';
import ObligationFormScreen from '../screens/ObligationFormScreen';
import OverviewScreen from '../screens/OverviewScreen';
import OverviewDrillScreen from '../screens/OverviewDrillScreen';
import StatementScreen from '../screens/StatementScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SubscribeScreen from '../screens/SubscribeScreen';
import { useTranslation } from '../i18n/I18nContext';
import { colors } from '../theme';

const Tab = createBottomTabNavigator();
const InvoicesStack = createNativeStackNavigator();
const ObligationsStack = createNativeStackNavigator();
const OverviewStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();

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
        name="NewInvoice"
        component={NewInvoiceScreen}
        options={{ title: t('newInvoice.title') }}
      />
      <InvoicesStack.Screen
        name="InvoiceDetail"
        component={InvoiceDetailScreen}
        options={{ title: t('invoiceDetail.title') }}
      />
      <InvoicesStack.Screen
        name="EditInvoice"
        component={NewInvoiceScreen}
        options={{ title: t('invoiceDetail.editTitle') }}
      />
      <InvoicesStack.Screen
        name="Subscribe"
        component={SubscribeScreen}
        options={{ title: t('billing.title'), presentation: 'modal' }}
      />
      <InvoicesStack.Screen
        name="Statement"
        component={StatementScreen}
        options={{ title: t('statement.title') }}
      />
    </InvoicesStack.Navigator>
  );
}

function ObligationsStackNavigator() {
  const { t } = useTranslation();
  return (
    <ObligationsStack.Navigator>
      <ObligationsStack.Screen
        name="ObligationsList"
        component={ObligationListScreen}
        options={{ title: t('obligations.title') }}
      />
      <ObligationsStack.Screen
        name="ObligationForm"
        component={ObligationFormScreen}
        options={({ route }) => ({
          title: route?.params?.obligationId ? t('obligations.editTitle') : t('obligations.newTitle'),
        })}
      />
    </ObligationsStack.Navigator>
  );
}

function OverviewStackNavigator() {
  const { t } = useTranslation();
  return (
    <OverviewStack.Navigator>
      <OverviewStack.Screen
        name="OverviewHome"
        component={OverviewScreen}
        options={{ title: t('overview.title') }}
      />
      <OverviewStack.Screen
        name="OverviewDrill"
        component={OverviewDrillScreen}
        options={{ title: t('overview.title') }}
      />
      <OverviewStack.Screen
        name="InvoiceDetail"
        component={InvoiceDetailScreen}
        options={{ title: t('invoiceDetail.title') }}
      />
      <OverviewStack.Screen
        name="EditInvoice"
        component={NewInvoiceScreen}
        options={{ title: t('invoiceDetail.editTitle') }}
      />
      <OverviewStack.Screen
        name="ObligationForm"
        component={ObligationFormScreen}
        options={({ route }) => ({
          title: route?.params?.obligationId ? t('obligations.editTitle') : t('obligations.newTitle'),
        })}
      />
      <OverviewStack.Screen
        name="Statement"
        component={StatementScreen}
        options={{ title: t('statement.title') }}
      />
    </OverviewStack.Navigator>
  );
}

function ProfileStackNavigator() {
  const { t } = useTranslation();
  return (
    <ProfileStack.Navigator>
      <ProfileStack.Screen
        name="ProfileHome"
        component={ProfileScreen}
        options={{ title: t('profile.title'), headerShown: false }}
      />
      <ProfileStack.Screen
        name="Subscribe"
        component={SubscribeScreen}
        options={{ title: t('billing.title'), presentation: 'modal' }}
      />
    </ProfileStack.Navigator>
  );
}

function TabIcon({ focused, name, outline }) {
  return (
    <View style={[styles.sideIcon, focused && styles.sideIconActive]}>
      <Ionicons name={focused ? name : outline} size={24} color={focused ? colors.primary : colors.textMuted} />
    </View>
  );
}

export default function RootNavigator() {
  const { t } = useTranslation();

  return (
    <NavigationContainer>
      <Tab.Navigator
        initialRouteName="Invoices"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: styles.tabBar,
          tabBarItemStyle: styles.tabBarItem,
          tabBarLabelStyle: styles.tabBarLabel,
        }}
      >
        <Tab.Screen
          name="Invoices"
          component={InvoicesStackNavigator}
          options={{
            title: t('tabs.invoices'),
            tabBarLabel: t('tabs.invoices'),
            tabBarIcon: ({ focused }) => (
              <TabIcon focused={focused} name="document-text" outline="document-text-outline" />
            ),
          }}
        />
        <Tab.Screen
          name="Obligations"
          component={ObligationsStackNavigator}
          options={{
            title: t('tabs.obligations'),
            tabBarLabel: t('tabs.obligations'),
            tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="wallet" outline="wallet-outline" />,
          }}
        />
        <Tab.Screen
          name="Overview"
          component={OverviewStackNavigator}
          options={{
            title: t('tabs.overview'),
            tabBarLabel: t('tabs.overview'),
            tabBarIcon: ({ focused }) => (
              <TabIcon focused={focused} name="stats-chart" outline="stats-chart-outline" />
            ),
          }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileStackNavigator}
          options={{
            title: t('tabs.profile'),
            tabBarLabel: t('tabs.profile'),
            tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="settings" outline="settings-outline" />,
          }}
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
    fontSize: 10,
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
});
