import API, { saveToken } from "../api/api";

export const loginUser = async (data) => {
    const res = await API.post("/users/login", data);
    // If OTP isn't required, the backend may return a token directly here.
    if (res.data?.token) await saveToken(res.data.token);
    return res.data;
};

export const registerUser = async (data) => {
    const res = await API.post("/users/register", data);
    return res.data;
};