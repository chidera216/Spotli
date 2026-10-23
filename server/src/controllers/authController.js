import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

function createToken(userId) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign({ userId: userId.toString() }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
}

function setAuthCookie(res, token) {
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export async function register(req, res) {
  try {
    const { firstName, lastName, email, password } = req.body;

    if (
      !firstName?.trim() ||
      !lastName?.trim() ||
      !email?.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters.",
      });
    }

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      authProvider: "email",
    });

    const token = createToken(user._id);
    setAuthCookie(res, token);

    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        username: user.username || "",
        bio: user.bio || "",
        avatar: user.avatar,
        isPrivate: Boolean(user.isPrivate),
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    console.error("Registration error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while creating your account.",
    });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({
      email: normalizedEmail,
    }).select("+password");

    if (!user?.password) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const token = createToken(user._id);
    setAuthCookie(res, token);

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        username: user.username || "",
        bio: user.bio || "",
        avatar: user.avatar,
        isPrivate: Boolean(user.isPrivate),
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while logging in.",
    });
  }
}

export async function getMe(req, res) {
  try {
    const user = await User.findById(req.userId).select(
      "firstName lastName email username bio location website avatar isPrivate authProvider createdAt",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Get current user error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve your account.",
    });
  }
}

export async function updateProfile(req, res) {
  try {
    const { firstName, lastName, username, bio, location, website } = req.body;
    const updates = {};

    if (typeof firstName === "string") {
      const value = firstName.trim();
      if (!value)
        return res
          .status(400)
          .json({ success: false, message: "First name cannot be empty." });
      if (value.length > 40)
        return res.status(400).json({
          success: false,
          message: "First name must be 40 characters or fewer.",
        });
      updates.firstName = value;
    }

    if (typeof lastName === "string") {
      const value = lastName.trim();
      if (!value)
        return res
          .status(400)
          .json({ success: false, message: "Last name cannot be empty." });
      if (value.length > 40)
        return res.status(400).json({
          success: false,
          message: "Last name must be 40 characters or fewer.",
        });
      updates.lastName = value;
    }

    if (typeof username === "string") {
      const value = username.trim().replace(/^@/, "").toLowerCase();
      if (!/^[a-z0-9._]{3,24}$/.test(value)) {
        return res.status(400).json({
          success: false,
          message:
            "Username must be 3–24 characters and use only letters, numbers, dots, or underscores.",
        });
      }
      const existingUsername = await User.findOne({
        username: value,
        _id: { $ne: req.userId },
      }).select("_id");
      if (existingUsername)
        return res
          .status(409)
          .json({ success: false, message: "That username is already taken." });
      updates.username = value;
    }

    if (typeof bio === "string") {
      const value = bio.trim();
      if (value.length > 160)
        return res.status(400).json({
          success: false,
          message: "Bio must be 160 characters or fewer.",
        });
      updates.bio = value;
    }

    if (typeof location === "string") {
      const value = location.trim();
      if (value.length > 80)
        return res.status(400).json({
          success: false,
          message: "Location must be 80 characters or fewer.",
        });
      updates.location = value;
    }

    if (typeof website === "string") {
      const value = website.trim();
      if (value.length > 200)
        return res.status(400).json({
          success: false,
          message: "Website must be 200 characters or fewer.",
        });
      if (value && !/^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/.*)?$/i.test(value))
        return res
          .status(400)
          .json({ success: false, message: "Enter a valid website URL." });
      updates.website = value;
    }

    if (typeof req.body.avatar === "string") {
      const avatarUrl = req.body.avatar.trim();
      let parsedAvatarUrl;

      try {
        parsedAvatarUrl = new URL(avatarUrl);
      } catch {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid profile picture URL.",
        });
      }

      if (
        parsedAvatarUrl.protocol !== "https:" ||
        parsedAvatarUrl.hostname !== "res.cloudinary.com"
      ) {
        return res.status(400).json({
          success: false,
          message: "Profile pictures must use a valid Cloudinary URL.",
        });
      }

      updates.avatar = parsedAvatarUrl.toString();
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: updates },
      { returnDocument: "after", runValidators: true },
    ).select(
      "firstName lastName email username bio location website avatar isPrivate authProvider createdAt",
    );

    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User account not found." });

    return res
      .status(200)
      .json({ success: true, message: "Profile updated successfully.", user });
  } catch (error) {
    if (error.code === 11000)
      return res
        .status(409)
        .json({ success: false, message: "That username is already taken." });
    if (error.name === "ValidationError")
      return res.status(400).json({ success: false, message: error.message });
    console.error("Update profile error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Unable to update your profile." });
  }
}

export function logout(req, res) {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  return res.status(200).json({
    success: true,
    message: "Logged out successfully.",
  });
}

export async function updateAccountPrivacy(req, res) {
  try {
    if (typeof req.body.isPrivate !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Account privacy must be true or false.",
      });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: { isPrivate: req.body.isPrivate } },
      { new: true, runValidators: true },
    ).select(
      "firstName lastName email username bio location website avatar isPrivate authProvider createdAt",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: user.isPrivate
        ? "Your account is now private."
        : "Your account is now public.",
      user,
    });
  } catch (error) {
    console.error("Update account privacy error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to update account privacy.",
    });
  }
}
