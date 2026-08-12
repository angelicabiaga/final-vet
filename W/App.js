import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as Linking from "expo-linking";

// Core Screens
import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";

// Helpers
import ForgotPasswordScreen from "./src/screens/security/password/ForgotPasswordScreen";
import LoginOtpScreen from "./src/screens/security/LoginOtpScreen";
import UnlockAccountScreen from "./src/screens/security/UnlockAccountScreen";

// Vet Screens
import VetAppointment from "./src/screens/dashboards/Veterinary/VetAppointment";
import VetDashboard from "./src/screens/dashboards/Veterinary/VetDashboard";
import VetMedRec from "./src/screens/dashboards/Veterinary/VetMedRec";
import VetMedRecDetail from "./src/screens/dashboards/Veterinary/VetMedRecDetail";
import VetMessages from "./src/screens/dashboards/Veterinary/VetMessages";
import VetNotif from "./src/screens/dashboards/Veterinary/VetNotif";
import VetProfile from "./src/screens/dashboards/Veterinary/VetProfile";
import VetInventory from "./src/screens/dashboards/Veterinary/VetInventory";
import VetLiveQueue from "./src/screens/dashboards/Veterinary/VetLiveQueue";
import VetPatients from "./src/screens/dashboards/Veterinary/VetPatients";

// Public Queue
import PublicQueueScreen from "./src/screens/PublicQueueScreen";

// Pet Owner Screens
import PetOwnerAppointment from "./src/screens/dashboards/PetOwner/PetOwnerAppointment";
import PetOwnerAppointmentSchedule from "./src/screens/dashboards/PetOwner/PetOwnerAppointmentSchedule";
import PetOwnerDashboard from "./src/screens/dashboards/PetOwner/PetOwnerDashboard";
import PetOwnerMedRec from "./src/screens/dashboards/PetOwner/PetOwnerMedRec";
import PetOwnerMessages from "./src/screens/dashboards/PetOwner/PetOwnerMessages";
import PetOwnerMyPets from "./src/screens/dashboards/PetOwner/PetOwnerMyPets";
import PetOwnerNotif from "./src/screens/dashboards/PetOwner/PetOwnerNotif";
import PetOwnerMyPetsEdit from "./src/screens/dashboards/PetOwner/PetOwnerMyPetsEdit";
import PetOwnerMyPetsView from "./src/screens/dashboards/PetOwner/PetOwnerMyPetsView";
import PetOwnerProfile from "./src/screens/dashboards/PetOwner/PetOwnerProfile";
import PetOwnerQuickAssist from "./src/screens/dashboards/PetOwner/PetOwnerQuickAssist";
import PetOwnerStaffMessages from "./src/screens/dashboards/PetOwner/PetOwnerStaffMessages";
import PetOwnerVetMessages from "./src/screens/dashboards/PetOwner/PetOwnerVetMessages";
import PetOwnerQueue from "./src/screens/dashboards/PetOwner/PetOwnerQueue";

const Stack = createNativeStackNavigator();

const linking = {
  prefixes: [
    "petcare://",
    "https://yourdomain.com",
  ],
  config: {
    screens: {
      unlock: "unlock-account/:token",
      PublicQueue: "queue",
    },
  },
};

export default function App() {
  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator
        initialRouteName="login"
        screenOptions={{ headerShown: false }}
      >
        {/* Authentication */}
        <Stack.Screen name="login" component={LoginScreen} />
        <Stack.Screen name="register" component={RegisterScreen} />
        <Stack.Screen name="forgot" component={ForgotPasswordScreen} />
        <Stack.Screen name="otp" component={LoginOtpScreen} />
        <Stack.Screen name="unlock" component={UnlockAccountScreen} />

        {/* Public Queue */}
        <Stack.Screen
          name="PublicQueue"
          component={PublicQueueScreen}
        />

        {/* Veterinarian Flow */}
        <Stack.Screen
          name="vet-screen"
          component={VetDashboard}
        />
        <Stack.Screen
          name="VetPatients"
          component={VetPatients}
        />
        <Stack.Screen
          name="VetAppointment"
          component={VetAppointment}
        />
        <Stack.Screen
          name="VetMedRec"
          component={VetMedRec}
        />
        <Stack.Screen
          name="VetMedRecDetail"
          component={VetMedRecDetail}
        />
        <Stack.Screen
          name="VetMessages"
          component={VetMessages}
        />
        <Stack.Screen
          name="VetNotif"
          component={VetNotif}
        />
        <Stack.Screen
          name="VetProfile"
          component={VetProfile}
        />
        <Stack.Screen
          name="VetInventory"
          component={VetInventory}
        />
        <Stack.Screen
          name="VetLiveQueue"
          component={VetLiveQueue}
        />

        {/* Pet Owner Flow */}
        <Stack.Screen
          name="petowner-screen"
          component={PetOwnerDashboard}
        />
        <Stack.Screen
          name="PetOwnerAppointment"
          component={PetOwnerAppointment}
        />
        <Stack.Screen
          name="PetOwnerAppointmentSchedule"
          component={PetOwnerAppointmentSchedule}
        />
        <Stack.Screen
          name="PetOwnerMedRec"
          component={PetOwnerMedRec}
        />
        <Stack.Screen
          name="PetOwnerMessages"
          component={PetOwnerMessages}
        />
        <Stack.Screen
          name="PetOwnerStaffMessages"
          component={PetOwnerStaffMessages}
        />
        <Stack.Screen
          name="PetOwnerVetMessages"
          component={PetOwnerVetMessages}
        />
        <Stack.Screen
          name="PetOwnerQuickAssist"
          component={PetOwnerQuickAssist}
        />
        <Stack.Screen
          name="PetOwnerMyPets"
          component={PetOwnerMyPets}
        />
        <Stack.Screen
          name="PetOwnerMyPetsEdit"
          component={PetOwnerMyPetsEdit}
        />
        <Stack.Screen
          name="PetOwnerMyPetsView"
          component={PetOwnerMyPetsView}
        />
        <Stack.Screen
          name="PetOwnerNotif"
          component={PetOwnerNotif}
        />
        <Stack.Screen
          name="PetOwnerProfile"
          component={PetOwnerProfile}
        />
        <Stack.Screen
          name="PetOwnerQueue"
          component={PetOwnerQueue}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}