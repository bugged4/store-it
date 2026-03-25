import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/lib/mongoose"
import User from "@/models/User"
import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"

const JWT_SECRET = process.env.JWT_SECRET as string

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    await connectDB()

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select("+password")
    

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 401 })
    }

    const isMatch = await bcrypt.compare(password, user.password)
    console.log("isMatch:", isMatch)

    if (!isMatch) {
      return NextResponse.json({ message: "Wrong password" }, { status: 401 })
    }
    // ...rest


    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" })

    // Build response
    const response = NextResponse.json(
      {
        message: "Login successful",
        token,
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          storageused: user.storageused,
          storagelimit: user.storagelimit,
        },
      },
      { status: 200 }
    )

    // Set HTTP-only cookie
    response.cookies.set("auth_token", token, {
      httpOnly: true,
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    })

    return response
  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}