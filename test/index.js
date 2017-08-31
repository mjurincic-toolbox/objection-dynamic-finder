const test = require('ava')
const knex = require('knex')
const Model = require('objection').Model
const Finder = require('../index.js')

// create knex connection to database
const db = knex({
	client: 'sqlite3',
	connection: { filename: './test/test.db' },
	useNullAsDefault: true
})

// bind knex instance to objection
Model.knex(db)

class Person extends Finder(Model) {
	static get tableName() {
		return 'persons'
	}

	static get jsonSchema() {
		return {
			properties: {
				id: { type: 'integer' },
				firstName: { type: 'string' },
				lastName: { type: 'string' },
				email: { type: 'string' }
			}
		}
	}
}

test('Using normal QueryBuilder methods', t => {
	return Person.query().where('first_name', 'John').then(persons => {
		t.is(persons[0].first_name, 'John')
	})
})

test('Using a single field', t => {
	return Person.query().firstName('John').then(persons => {
		t.is(persons[0].first_name, 'John')
	})
})

test('Using multiple fields with "and"', t => {
	return Person.query().firstNameAndLastName('John', 'Smith').then(persons => {
		t.is(persons.length, 1)
		t.is(persons[0].last_name, 'Smith')
	})
})

test('Using multiple fields with "or"', t => {
	return Promise.all([
		Person.query().firstNameAndEmailOrLastName('Jane', 'jane@ccc.com', 'Adams'),
		Person.query().firstNameAndEmailOrLastName('Jane', 'john.adam@xyz.com', 'Adams')
	]).then(([ persons, person ]) => {
		t.is(persons.length, 2)

		const lastNames = persons.map(person => person.last_name)
		t.is(lastNames.includes('Adams'), true)
		t.is(lastNames.includes('Quincy'), true)

		t.is(person.length, 1)
		t.is(person[0].last_name, 'Adams')
	})
})

test('Using a beginning "or"', t => {
	const personsQuery = Person.query()
	personsQuery.where('email', 'john.adam@xyz.com').orFirstName('Jane')

	return personsQuery.then(persons => {
		t.is(persons.length, 2)

		const lastNames = persons.map(person => person.last_name)
		t.is(lastNames.includes('Adams'), true)
		t.is(lastNames.includes('Quincy'), true)
	})
})

test('Find or fail', t => {
	const personsQuery = Person.query().firstNameOrFail('Jim')

	return personsQuery.then(() => t.fail())
		.catch(err => {
			t.is(err.message, 'NotFoundError')
		})
})

test('Find or fail. Stub Objection version < 0.8.1', t => {
	const throwIfNotFound = Person.QueryBuilder.prototype.throwIfNotFound
	Person.QueryBuilder.prototype.throwIfNotFound = null

	const personsQuery = Person.query().firstNameOrFail('Jim')
	const updatePersonQuery = Person.query().firstNameOrFail('Jim').update({ email: 'jim@abc.com' })
	const successfulPersonsQuery = Person.query().firstNameOrFail('John')

	return successfulPersonsQuery.then(() => {
		return personsQuery.then(() => {
			Person.QueryBuilder.prototype.throwIfNotFound = throwIfNotFound
			t.fail()
		}).catch(err => {
			t.is(err.message, 'No models found')
		}).then(() => {
			return updatePersonQuery.then(() => {
				Person.QueryBuilder.prototype.throwIfNotFound = throwIfNotFound
				t.fail()
			}).catch(err => {
				Person.QueryBuilder.prototype.throwIfNotFound = throwIfNotFound
				t.is(err.message, 'No models found')
			})
		})
	}).catch(() => t.fail())
})

test('Getting on a non-existing field return undefined', t => {
	t.is(Person.query().wwhere, undefined)
})

test('Querying on a non-existing field fails', t => {
	try {
		Person.query().asdfead('Jane')
		t.fail()
	} catch(err) {
		t.is(err.name, 'TypeError')
		t.is(err.message, 'Person.query(...).asdfead is not a function')
	}
})

test('Using without a jsonSchema fails', t => {
	const schema = Person.$$jsonSchema
	Person.$$jsonSchema =  null

	try {
		Person.query().where('first_name', 'John').first()
	} catch(err) {
		Person.$$jsonSchema = schema
		t.fail()
	}

	try {
		Person.query().firstName('John').first()
	} catch(err) {
		t.is(err.message, 'Attempting to use dynamic finders without a jsonSchema. Please define it')
	}

	Person.$$jsonSchema = schema
})

test('Continue chaining queries on top of finder', t => {
	return Person.query().firstName('John').where('last_name', 'Adams').first().then(person => {
		t.is(person.last_name, 'Adams')
	})
})

test.before(() => {
	return db.schema.createTableIfNotExists('persons', table => {
		table.increments('id').primary()
		table.string('first_name')
		table.string('last_name')
		table.string('email')
	}).then(() => {
		return db('persons').delete()
	}).then(() => {
		return Promise.all([
			Person.query().insert({ first_name: 'John', last_name: 'Smith', email: 'john.smith@xyz.com' }),
			Person.query().insert({ first_name: 'John', last_name: 'Adams', email: 'john.adam@xyz.com' }),
			Person.query().insert({ first_name: 'Jane', last_name: 'Quincy', email: 'jane@ccc.com' })
		])
	})
})

test.after(() => {
	return db.schema.dropTable('persons').then(() => db.destroy())
})
