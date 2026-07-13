import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { ParentUser } from "../types";
import { captureAdminAuthFromHash, PARENT_AUTH_STORAGE_KEY } from "../utils/adminPreview";

captureAdminAuthFromHash();

interface AuthState {
  user: ParentUser | null;
}

const savedUser = localStorage.getItem(PARENT_AUTH_STORAGE_KEY);
const initialState: AuthState = {
  user: savedUser ? JSON.parse(savedUser) : null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<ParentUser | null>) => {
      state.user = action.payload;
      if (action.payload) {
        localStorage.setItem(PARENT_AUTH_STORAGE_KEY, JSON.stringify(action.payload));
      } else {
        localStorage.removeItem(PARENT_AUTH_STORAGE_KEY);
      }
    },
  },
});

export const { setUser } = authSlice.actions;
export default authSlice.reducer;
