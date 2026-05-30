import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { TeacherUser } from "../types";

interface AuthState {
  user: TeacherUser | null;
}

const savedUser = localStorage.getItem("teacher_auth_user");
const initialState: AuthState = {
  user: savedUser ? JSON.parse(savedUser) : null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<TeacherUser | null>) => {
      state.user = action.payload;
      if (action.payload) {
        localStorage.setItem("teacher_auth_user", JSON.stringify(action.payload));
      } else {
        localStorage.removeItem("teacher_auth_user");
      }
    },
  },
});

export const { setUser } = authSlice.actions;
export default authSlice.reducer;
