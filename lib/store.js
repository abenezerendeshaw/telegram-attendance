// lib/store.js
// Global memory object that persists across serverless function invocations on the same instance
global.dailyAttendanceStore = global.dailyAttendanceStore || new Set();

export const attendanceStore = {
  addStudent: (name) => {
    if (name) {
      global.dailyAttendanceStore.add(name.trim().toLowerCase());
    }
  },
  getSubmittedNames: () => {
    return global.dailyAttendanceStore;
  },
  clearStore: () => {
    global.dailyAttendanceStore.clear();
  }
};