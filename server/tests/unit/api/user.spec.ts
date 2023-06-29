import request from "supertest";
import { app } from "../../../app";
import usermanager from "../../../usermanager";
import { User as UserModel } from "../../../models";

describe("User API", () => {
	let token;
	beforeEach(async () => {
		await UserModel.destroy({ where: {} });

		await usermanager.registerUser({
			email: "forced@localhost",
			username: "forced test user",
			password: "test1234",
		});

		await usermanager.registerUser({
			email: "test@localhost",
			username: "test user",
			password: "test1234",
		});

		await usermanager.registerUserSocial({
			username: "social user",
			discordId: 1234567890,
		});

		let resp = await request(app).get("/api/auth/grant").expect(200);
		token = resp.body.token;
	});

	afterAll(async () => {
		await UserModel.destroy({ where: {} });
	});

	describe("GET /user", () => {
		it("should not fail by default", async () => {
			let resp = await request(app)
				.get("/api/user")
				.set("Authorization", `Bearer ${token}`)
				.expect("Content-Type", /json/)
				.expect(200);
			expect(resp.body.username).toBeDefined();
			expect(resp.body.loggedIn).toBe(false);
		});

		it("should have the forced test user logged in", async () => {
			let resp = await request(app)
				.get("/api/user/test/forceLogin")
				.set("Authorization", `Bearer ${token}`)
				.expect(200);
			let cookies = resp.header["set-cookie"];

			await request(app)
				.get("/api/user")
				.set("Authorization", `Bearer ${token}`)
				.set("Cookie", cookies)
				.expect("Content-Type", /json/)
				.expect(200)
				.then(resp => {
					expect(resp.body.username).toBeDefined();
					expect(resp.body.loggedIn).toBe(true);
					expect(resp.body).toEqual({
						username: "forced test user",
						loggedIn: true,
						discordLinked: false,
					});
				});
		});
	});

	describe("POST /user", () => {
		let onUserModifiedSpy;

		beforeAll(() => {
			onUserModifiedSpy = jest.fn();
			usermanager.on("userModified", onUserModifiedSpy);
		});

		beforeEach(async () => {
			onUserModifiedSpy.mockClear();
		});

		afterAll(() => {
			onUserModifiedSpy.mockRestore();
			usermanager.off("userModified", onUserModifiedSpy);
		});

		it("should change the unregistered user's name without failing", async () => {
			let resp = await request(app)
				.post("/api/user")
				.set("Authorization", `Bearer ${token}`)
				.send({ username: "new username" })
				.expect("Content-Type", /json/)
				.expect(200);

			expect(resp.body.success).toBe(true);
			expect(onUserModifiedSpy).toBeCalled();

			resp = await request(app)
				.get("/api/user")
				.set("Authorization", `Bearer ${token}`)
				.expect(200);

			expect(resp.body.username).toBe("new username");
		});

		it("should change the registered user's name without failing", async () => {
			let cookies;
			await request(app)
				.get("/api/user/test/forceLogin")
				.set("Authorization", `Bearer ${token}`)
				.expect(200)
				.then(resp => {
					cookies = resp.header["set-cookie"];
				});

			await request(app)
				.post("/api/user")
				.set("Authorization", `Bearer ${token}`)
				.set("Cookie", cookies)
				.send({ username: "new username" })
				.expect("Content-Type", /json/)
				// .expect(200)
				.then(resp => {
					expect(resp.body.success).toBe(true);
					expect(onUserModifiedSpy).toBeCalled();
				});

			let resp = await request(app)
				.get("/api/user")
				.set("Authorization", `Bearer ${token}`)
				.expect(200);

			expect(resp.body.username).toBe("new username");
		});

		it("should not change the registered user's name if it's already in use", async () => {
			let cookies;
			await request(app)
				.get("/api/user/test/forceLogin")
				.set("Authorization", `Bearer ${token}`)
				.expect(200)
				.then(resp => {
					cookies = resp.header["set-cookie"];
				});

			await request(app)
				.post("/api/user")
				.set("Authorization", `Bearer ${token}`)
				.set("Cookie", cookies)
				.send({ username: "test user" })
				.expect("Content-Type", /json/)
				.expect(400)
				.then(resp => {
					expect(resp.body.success).toBe(false);
					expect(resp.body.error).toBeDefined();
					expect(resp.body.error.name).toEqual("UsernameTaken");
					expect(onUserModifiedSpy).not.toBeCalled();
				});
		});
	});

	describe("User login and registration", () => {
		describe("POST /user/login", () => {
			let onUserLogInSpy;

			beforeAll(() => {
				onUserLogInSpy = jest.fn();
				usermanager.on("login", onUserLogInSpy);
			});

			beforeEach(async () => {
				onUserLogInSpy.mockClear();
			});

			afterAll(() => {
				onUserLogInSpy.mockRestore();
				usermanager.off("login", onUserLogInSpy);
			});

			it("should log in the test user", async () => {
				await request(app)
					.post("/api/user/login")
					.set("Authorization", `Bearer ${token}`)
					.send({ user: "test@localhost", password: "test1234" })
					.then(resp => {
						expect(resp.body).toEqual({
							success: true,
							user: {
								username: "test user",
								email: "test@localhost",
							},
						});
						expect(onUserLogInSpy).toBeCalled();
					});
			});

			it("should not log in the test user with wrong credentials", async () => {
				await request(app)
					.post("/api/user/login")
					.set("Authorization", `Bearer ${token}`)
					.send({ user: "notreal@localhost", password: "test1234" })
					.then(resp => {
						expect(resp.body.success).toBe(false);
						expect(onUserLogInSpy).not.toBeCalled();
					});
				await request(app)
					.post("/api/user/login")
					.set("Authorization", `Bearer ${token}`)
					.send({ user: "test@localhost", password: "wrong" })
					.then(resp => {
						expect(resp.body.success).toBe(false);
						expect(onUserLogInSpy).not.toBeCalled();
					});
			});

			it("should not log in the social user with no password", async () => {
				await request(app)
					.post("/api/user/login")
					.set("Authorization", `Bearer ${token}`)
					.send({ user: "social@localhost", password: "test1234" })
					.then(resp => {
						expect(resp.body.success).toBe(false);
						expect(onUserLogInSpy).not.toBeCalled();
					});
			});
		});

		describe("POST /user/logout", () => {
			let onUserLogOutSpy;

			beforeAll(() => {
				onUserLogOutSpy = jest.fn();
				usermanager.on("logout", onUserLogOutSpy);
			});

			beforeEach(async () => {
				onUserLogOutSpy.mockClear();
			});

			afterAll(() => {
				onUserLogOutSpy.mockRestore();
				usermanager.off("logout", onUserLogOutSpy);
			});

			it("should log out the test uesr", async () => {
				await request(app)
					.get("/api/user/test/forceLogin")
					.set("Authorization", `Bearer ${token}`)
					.expect(200);

				await request(app)
					.post("/api/user/logout")
					.set("Authorization", `Bearer ${token}`)
					.expect("Content-Type", /json/)
					.expect(200)
					.then(resp => {
						expect(resp.body.success).toBe(true);
					});
			});

			it("should fail if the user is not logged in", async () => {
				await request(app)
					.post("/api/user/logout")
					.set("Authorization", `Bearer ${token}`)
					.expect("Content-Type", /json/)
					.expect(400)
					.then(resp => {
						expect(resp.body.success).toBe(false);
					});
			});
		});

		describe("POST /user/register", () => {
			let onUserLogInSpy;

			beforeAll(() => {
				onUserLogInSpy = jest.fn();
				usermanager.on("login", onUserLogInSpy);
			});

			beforeEach(async () => {
				onUserLogInSpy.mockClear();
			});

			afterAll(() => {
				onUserLogInSpy.mockRestore();
				usermanager.off("login", onUserLogInSpy);
			});

			it("should register user", async () => {
				await request(app)
					.post("/api/user/register")
					.set("Authorization", `Bearer ${token}`)
					.send({
						email: "register@localhost",
						username: "registered",
						password: "test1234",
					})
					.expect(200)
					.expect("Content-Type", /json/)
					.then(resp => {
						expect(resp.body).toEqual({
							success: true,
							user: {
								username: "registered",
								email: "register@localhost",
							},
						});
						expect(onUserLogInSpy).toBeCalled();
					});
			});

			it("should register user, but ignore email if it's an empty string ", async () => {
				await request(app)
					.post("/api/user/register")
					.set("Authorization", `Bearer ${token}`)
					.send({ email: "", username: "registered", password: "test1234" })
					.expect(200)
					.expect("Content-Type", /json/)
					.then(resp => {
						expect(resp.body.success).toBe(true);
					});

				await request(app)
					.post("/api/user/register")
					.set("Authorization", `Bearer ${token}`)
					.send({ email: "", username: "registered2", password: "test1234" })
					.expect(200)
					.expect("Content-Type", /json/)
					.then(resp => {
						expect(resp.body.success).toBe(true);
					});
			});

			it("should not register user if email is already in use", async () => {
				await request(app)
					.post("/api/user/register")
					.set("Authorization", `Bearer ${token}`)
					.send({ email: "test@localhost", username: "registered", password: "test1234" })
					.expect(400)
					.expect("Content-Type", /json/)
					.then(resp => {
						expect(resp.body.success).toBe(false);
						expect(resp.body.error).toBeDefined();
						expect(resp.body.error.name).toEqual("AlreadyInUse");
						expect(onUserLogInSpy).not.toBeCalled();
					});
			});

			it("should not register user if username is already in use", async () => {
				await request(app)
					.post("/api/user/register")
					.set("Authorization", `Bearer ${token}`)
					.send({
						email: "register@localhost",
						username: "test user",
						password: "test1234",
					})
					.expect(400)
					.expect("Content-Type", /json/)
					.then(resp => {
						expect(resp.body.success).toBe(false);
						expect(resp.body.error).toBeDefined();
						expect(resp.body.error.name).toEqual("AlreadyInUse");
						expect(onUserLogInSpy).not.toBeCalled();
					});
			});

			it("should not register user if email is invalid", async () => {
				await request(app)
					.post("/api/user/register")
					.set("Authorization", `Bearer ${token}`)
					.send({ email: "bad", username: "bad email user", password: "test1234" })
					.expect(400)
					.expect("Content-Type", /json/)
					.then(resp => {
						expect(resp.body.success).toBe(false);
						expect(resp.body.error).toBeDefined();
						expect(resp.body.error.name).toEqual("ValidationError");
						expect(onUserLogInSpy).not.toBeCalled();
					});
			});

			it("should not register user if username is invalid", async () => {
				await request(app)
					.post("/api/user/register")
					.set("Authorization", `Bearer ${token}`)
					.send({ email: "badusername@localhost", username: "", password: "test1234" })
					.expect(400)
					.expect("Content-Type", /json/)
					.then(resp => {
						expect(resp.body.success).toBe(false);
						expect(resp.body.error).toBeDefined();
						expect(resp.body.error.name).toEqual("ValidationError");
						expect(onUserLogInSpy).not.toBeCalled();
					});
			});

			it("should not register user if password is not good enough", async () => {
				await request(app)
					.post("/api/user/register")
					.set("Authorization", `Bearer ${token}`)
					.send({
						email: "badpassword@localhost",
						username: "bad password",
						password: "a",
					})
					.expect(400)
					.expect("Content-Type", /json/)
					.then(resp => {
						expect(resp.body.success).toBe(false);
						expect(resp.body.error).toBeDefined();
						expect(resp.body.error.name).toEqual("ValidationError");
						expect(onUserLogInSpy).not.toBeCalled();
					});
			});
		});
	});
});