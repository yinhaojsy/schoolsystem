import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { ParentUser } from "../types";

interface AuthState {
  user: ParentUser | null;
}

const savedUser = localStorage.getItem("parent_auth_user");
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
        localStorage.setItem("parent_auth_user", JSON.stringify(action.payload));
      } else {
        localStorage.removeItem("parent_auth_user");
      }
    },
  },
});

export const { setUser } = authSlice.actions;
export default authSlice.reducer;
