import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet } from 'react-native';
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

export default function RootNavigator() {
  const { t } = useTranslation();

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: route.name !== 'Invoices',
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700', fontSize: 17 },
          headerShadowVisible: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarIcon: ({ color, size, focused }) => {
            if (route.name === 'Invoices') {
              return <Ionicons name={focused ? 'document-text' : 'document-text-outline'} size={size} color={color} />;
            }
            if (route.name === 'NewInvoice') {
              return (
                <View style={styles.plusButton}>
                  <Ionicons name="add" size={26} color="#fff" />
                </View>
              );
            }
            if (route.name === 'Profile') {
              return <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />;
            }
            return null;
          },
        })}
      >
        <Tab.Screen name="Invoices" component={InvoicesStackNavigator} options={{ title: t('tabs.invoices') }} />
        <Tab.Screen
          name="NewInvoice"
          component={NewInvoiceScreen}
          options={{ title: t('tabs.newInvoice'), tabBarLabel: t('tabs.newInvoice'), headerTitle: t('newInvoice.title') }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{ title: t('tabs.profile'), headerTitle: t('profile.title') }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  plusButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
});
