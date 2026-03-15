import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { User } from '@/lib/models';

// GET /api/users — list all users (admin use)
// GET /api/users?email=x — find by email
export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (email) {
      const user = await User.findOne({ email }).lean();
      if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
      return NextResponse.json(user);
    }

    const users = await User.find({}).lean();
    return NextResponse.json(users);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/users — create a new user
export async function POST(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { email, name, storagelimit } = body;

    if (!email || !name) {
      return NextResponse.json({ error: 'email and name are required' }, { status: 400 });
    }

    const user = await User.create({ email, name, storagelimit });
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    if (error.code === 11000) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
