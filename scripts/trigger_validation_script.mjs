// scripts/validate_048_admin_rest.mjs

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
}

if (!SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const serviceHeaders = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

async function requestJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...serviceHeaders,
      ...(options.headers || {}),
    },
  });

  const text = await res.text();

  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    console.error("Request failed:", {
      url,
      status: res.status,
      statusText: res.statusText,
      body,
    });
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }

  return body;
}

async function supabaseRest(path, options = {}) {
  return requestJson(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
  });
}

async function createAuthUser() {
  const email = `trigger-validation-${Date.now()}@example.com`;

  const authUser = await requestJson(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    body: JSON.stringify({
      email,
      password: `TempPass-${crypto.randomUUID()}-123!`,
      email_confirm: true,
      user_metadata: {
        purpose: "migration_048_trigger_validation",
      },
    }),
  });

  if (!authUser?.id) {
    throw new Error("Auth user was created but no id was returned");
  }

  return authUser;
}

async function deleteAuthUser(userId) {
  try {
    await requestJson(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
    });

    console.log("Cleaned up auth user:", userId);
  } catch (err) {
    console.warn("Cleanup warning: could not delete auth user:", userId);
    console.warn(err.message);
  }
}

async function getQueueRows(userId) {
  return supabaseRest(
    `eligibility_recompute_queue?user_id=eq.${userId}&select=*`,
    {
      method: "GET",
    }
  );
}

async function main() {
  const authUser = await createAuthUser();
  const userId = authUser.id;

  console.log("Created auth user:", userId);

  try {
    console.log("Creating valid profile for auth user:", userId);

    const today = new Date();
    const dob = new Date(
      Date.UTC(today.getUTCFullYear() - 25, today.getUTCMonth(), today.getUTCDate())
    )
      .toISOString()
      .slice(0, 10);

    const insertedProfile = await supabaseRest("profiles", {
      method: "POST",
      body: JSON.stringify({
        id: userId,

        full_name: "Trigger Validation User",
        career_stage: "aspirant",
        target_type: "government_exam",
        target_exam: "SSC CGL",
        graduation_year: today.getUTCFullYear() - 3,

        date_of_birth: dob,
        dob,

        gender: "male",
        category: "general",
        pwbd_status: "none",
        domicile_state: "Maharashtra",
        nationality: "Indian",

        ex_serviceman: false,
        govt_employee: false,

        phone: `90000${String(Date.now()).slice(-5)}`,

        onboarding_step: 6,
        onboarding_completed: true,

        is_admin: false,
        plan_id: "free",
        is_instructor: false,
        instructor_bio: null,
        avatar_url: null,
        service_years: 0,
        admin_role: null,
        career_goal: "Validate eligibility recompute trigger",

        created_at: new Date().toISOString(),
      }),
    });

    console.log("Profile inserted:");
    console.table(insertedProfile);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const queueRows = await getQueueRows(userId);

    if (!queueRows || queueRows.length === 0) {
      throw new Error(
        `FAILED: profile was inserted but no eligibility_recompute_queue row found for user_id=${userId}`
      );
    }

    console.log("PASSED: Queue row created.");
    console.table(queueRows);

    console.log("\nNow run your APScheduler worker in another terminal.");
    console.log("Try one of these depending on your project scripts:");
    console.log("  npm run elig:recompute");
    console.log("  npm run worker");
    console.log("  python -m app.workers.eligibility_recompute_worker");
    console.log("\nAfter worker runs, this script will poll the queue for up to 6 minutes.");
    const startedAt = Date.now();
    let finalRows = queueRows;

    while (Date.now() - startedAt < 360_000) {
      await new Promise((resolve) => setTimeout(resolve, 3000));

      finalRows = await getQueueRows(userId);

      console.log("Queue state:");
      console.table(finalRows);

      const drained =
        finalRows.length === 0 ||
        finalRows.every((row) =>
          ["completed", "done", "processed", "success"].includes(
            String(row.status || "").toLowerCase()
          )
        );

      if (drained) {
        console.log("PASSED: Worker drained/processed the queue.");
        return;
      }
    }

    throw new Error(
      "FAILED: Queue row was created, but worker did not drain/process it within  6 minutes."
    );
  }
 //finally {
//     await deleteAuthUser(userId);
//   }
finally {
  console.log("Debug mode: not deleting auth user yet.");
  console.log("Delete manually after validation if needed:", userId);
}
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});